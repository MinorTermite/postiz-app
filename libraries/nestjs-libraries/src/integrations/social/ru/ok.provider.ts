import { createHash } from 'crypto';
import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import {
  BadBody,
  RefreshToken,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import dayjs from 'dayjs';
import {
  ruFileName,
  ruIsVideo,
  ruMediaPath,
  ruMimeType,
  ruPlainText,
} from './ru.media';

const OK_API = 'https://api.ok.ru/fb.do';

type OkKeys = {
  applicationKey: string;
  secretKey: string;
  accessToken: string;
};

const md5 = (value: string) => createHash('md5').update(value, 'utf8').digest('hex');

// Odnoklassniki group through an OK application with the permanent access
// token from the app settings (ok.ru/dk?st.cmd=appEditBasic). The app needs
// GROUP_CONTENT, PHOTO_CONTENT, VIDEO_CONTENT and VALUABLE_ACCESS, which
// api-support@ok.ru grants on request.
export class OkProvider extends SocialAbstract implements SocialProvider {
  identifier = 'ok';
  name = 'Odnoklassniki';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;
  toolTip =
    'OK application: Application key (public), Secret key, permanent access_token from the app settings, and the numeric group id. Permissions GROUP_CONTENT, PHOTO_CONTENT, VIDEO_CONTENT are granted by api-support@ok.ru.';

  maxLength() {
    return 60000;
  }

  async customFields() {
    return [
      {
        key: 'applicationKey',
        label: 'Application key (public)',
        validation: `/^[A-Za-z0-9]{6,}$/`,
        type: 'text' as const,
      },
      {
        key: 'secretKey',
        label: 'Application secret key',
        validation: `/^.{6,}$/`,
        type: 'password' as const,
      },
      {
        key: 'accessToken',
        label: 'Permanent access_token',
        validation: `/^.{10,}$/`,
        type: 'password' as const,
      },
      {
        key: 'groupId',
        label: 'Group id (numeric, from ok.ru/group/<id>)',
        validation: `/^\\d{5,}$/`,
        type: 'text' as const,
      },
    ];
  }

  async refreshToken(): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const state = makeSecureId(17);
    return { url: state, codeVerifier: makeSecureId(10), state };
  }

  private async call<T = any>(
    keys: OkKeys,
    method: string,
    params: Record<string, string> = {}
  ): Promise<T> {
    const all: Record<string, string> = {
      application_key: keys.applicationKey,
      format: 'json',
      method,
      ...params,
    };
    const sig = md5(
      Object.keys(all)
        .sort()
        .map((key) => `${key}=${all[key]}`)
        .join('') + md5(keys.accessToken + keys.secretKey)
    ).toLowerCase();

    const body = new URLSearchParams({
      ...all,
      sig,
      access_token: keys.accessToken,
    });
    const response = await (
      await this.fetch(OK_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    ).json();

    if (response && typeof response === 'object' && response.error_code) {
      const json = JSON.stringify(response);
      const message = response.error_msg || 'OK rejected the request';
      // 102 session expired, 103 invalid session, 104 bad signature
      if ([102, 103, 104].includes(response.error_code)) {
        throw new RefreshToken(this.identifier, json, '{}', message);
      }
      throw new BadBody(this.identifier, json, '{}', message);
    }
    return response;
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    try {
      const body = JSON.parse(Buffer.from(params.code, 'base64').toString());
      const keys: OkKeys = {
        applicationKey: String(body.applicationKey || '').trim(),
        secretKey: String(body.secretKey || '').trim(),
        accessToken: String(body.accessToken || '').trim(),
      };
      const groupId = String(body.groupId || '').trim();

      const [group] = await this.call<any[]>(keys, 'group.getInfo', {
        uids: groupId,
        fields: 'uid,name,shortname,pic_avatar',
      });
      if (!group) {
        return 'OK group not found';
      }

      return {
        id: groupId,
        name: group.name || `OK ${groupId}`,
        accessToken: AuthService.signJWT(keys),
        refreshToken: '',
        expiresIn: dayjs().add(200, 'year').unix() - dayjs().unix(),
        picture: group.pic_avatar || group.picAvatar || '',
        username: group.shortname || groupId,
      };
    } catch (e) {
      console.log(e);
      return 'Invalid OK application keys, token or group id';
    }
  }

  private async uploadPhoto(
    keys: OkKeys,
    groupId: string,
    path: string
  ): Promise<string> {
    const { upload_url } = await this.call(keys, 'photosV2.getUploadUrl', {
      gid: groupId,
    });
    const file = await this.readOrFetch(path);
    const form = new FormData();
    form.append(
      'pic1',
      new Blob([new Uint8Array(file)], { type: ruMimeType(path) }),
      ruFileName(path)
    );
    const uploaded = await (
      await fetch(upload_url, { method: 'POST', body: form })
    ).json();
    const photo: any = Object.values(uploaded?.photos || {})[0];
    if (!photo?.token) {
      throw new BadBody(
        this.identifier,
        JSON.stringify(uploaded),
        '{}',
        'OK rejected the photo upload'
      );
    }
    return photo.token;
  }

  private async uploadVideo(
    keys: OkKeys,
    groupId: string,
    path: string
  ): Promise<string> {
    const size = await this.mediaSize(path, this.identifier);
    const { upload_url, video_id } = await this.call(
      keys,
      'video.getUploadUrl',
      {
        gid: groupId,
        file_name: ruFileName(path),
        file_size: String(size),
      }
    );
    const file = await this.readOrFetch(path);
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file)], { type: ruMimeType(path) }),
      ruFileName(path)
    );
    const uploaded = await fetch(upload_url, { method: 'POST', body: form });
    if (!uploaded.ok) {
      throw new BadBody(
        this.identifier,
        await uploaded.text(),
        '{}',
        'OK rejected the video upload'
      );
    }
    return String(video_id);
  }

  async post(
    groupId: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const keys = AuthService.verifyJWT(accessToken) as OkKeys;
    const [firstPost] = postDetails;

    const media: any[] = [];
    const text = ruPlainText(firstPost.message);
    if (text) {
      media.push({ type: 'text', text });
    }

    const photos: { id: string }[] = [];
    for (const item of firstPost.media || []) {
      const path = ruMediaPath(item.path);
      if (ruIsVideo(item)) {
        media.push({
          type: 'movie',
          list: [{ id: await this.uploadVideo(keys, groupId, path) }],
        });
      } else {
        photos.push({ id: await this.uploadPhoto(keys, groupId, path) });
      }
    }
    if (photos.length) {
      media.push({ type: 'photo', list: photos });
    }

    const topicId = await this.call(keys, 'mediatopic.post', {
      gid: groupId,
      type: 'GROUP_THEME',
      attachment: JSON.stringify({ media }),
    });

    return [
      {
        id: firstPost.id,
        postId: String(topicId),
        releaseURL: `https://ok.ru/group/${groupId}/topic/${topicId}`,
        status: 'completed',
      },
    ];
  }
}

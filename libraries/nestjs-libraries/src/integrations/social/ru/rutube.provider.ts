import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import {
  BadBody,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import dayjs from 'dayjs';
import { ruIsPublicUrl, ruIsVideo, ruPlainText, ruPublicUrl } from './ru.media';

const RUTUBE_API = 'https://rutube.ru/api';

// Rutube channel through the Rutube API: login -> token, then the video is
// imported by Rutube from a public URL. With local storage the media url is
// FRONTEND_URL/uploads/..., so FRONTEND_URL must be a public address (domain
// or tunnel) or the storage must be S3/R2.
export class RutubeProvider extends SocialAbstract implements SocialProvider {
  identifier = 'rutube';
  name = 'Rutube';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;
  toolTip =
    'Rutube login (email or phone) and password of the channel owner. The video is imported by Rutube from a public link: FRONTEND_URL must be a public domain or tunnel, or media must be on S3/R2.';

  maxLength() {
    return 5000;
  }

  async customFields() {
    return [
      {
        key: 'username',
        label: 'Rutube login (email or phone)',
        validation: `/^.{3,}$/`,
        type: 'text' as const,
      },
      {
        key: 'password',
        label: 'Rutube password',
        validation: `/^.{3,}$/`,
        type: 'password' as const,
      },
      {
        key: 'categoryId',
        label: 'Category id (13 = Other, 17 = Education, 67 = Business, 78 = Product reviews)',
        defaultValue: '13',
        validation: `/^\\d{1,3}$/`,
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

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    try {
      const body = JSON.parse(Buffer.from(params.code, 'base64').toString());
      const login = await fetch(`${RUTUBE_API}/accounts/token_auth/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: String(body.username || '').trim(),
          password: String(body.password || ''),
        }),
      });
      if (!login.ok) {
        return 'Rutube rejected the login or password';
      }
      const { token } = await login.json();

      const profile = await (
        await fetch(`${RUTUBE_API}/profile/user/`, {
          headers: { Authorization: `Token ${token}` },
        })
      )
        .json()
        .catch(() => ({}));

      const id = String(profile?.id || body.username);
      return {
        id,
        name: profile?.name || profile?.username || String(body.username),
        accessToken: AuthService.signJWT({
          token,
          categoryId: String(body.categoryId || '13'),
        }),
        refreshToken: '',
        expiresIn: dayjs().add(200, 'year').unix() - dayjs().unix(),
        picture: profile?.avatar_url || '',
        username: profile?.username || id,
      };
    } catch (e) {
      console.log(e);
      return 'Rutube login failed';
    }
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const { token, categoryId } = AuthService.verifyJWT(accessToken) as any;
    const [firstPost] = postDetails;
    const video = (firstPost.media || []).find(ruIsVideo);
    if (!video) {
      throw new BadBody(
        this.identifier,
        '{}',
        '{}',
        'Rutube needs a video in the post'
      );
    }

    const url = ruPublicUrl(video.path);
    if (!ruIsPublicUrl(url)) {
      throw new BadBody(
        this.identifier,
        JSON.stringify({ url }),
        '{}',
        'Rutube downloads the video by link: set a public FRONTEND_URL or S3 storage'
      );
    }

    const text = ruPlainText(firstPost.message);
    const [firstLine, ...rest] = text.split('\n');
    const title = (firstPost.settings?.title || firstLine || 'Видео').slice(
      0,
      100
    );
    const description = (firstPost.settings?.title ? text : rest.join('\n'))
      .trim()
      .slice(0, 5000);

    const body = JSON.stringify({
      url,
      title,
      description,
      is_hidden: false,
      category_id: Number(categoryId || 13),
    });
    const created = await (
      await this.fetch(`${RUTUBE_API}/video/`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json',
        },
        body,
      })
    ).json();

    const videoId = String(created?.video_id || created?.id || '');
    return [
      {
        id: firstPost.id,
        postId: videoId,
        releaseURL: videoId ? `https://rutube.ru/video/${videoId}/` : '',
        status: 'completed',
      },
    ];
  }
}

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
import { timer } from '@gitroom/helpers/utils/timer';
import dayjs from 'dayjs';
import {
  ruFileName,
  ruIsVideo,
  ruMaxHtml,
  ruMediaPath,
  ruMimeType,
  ruTrustedDispatcher,
} from './ru.media';

const MAX_API = 'https://platform-api2.max.ru';

// MAX (max.ru) channels and chats through a bot of the MAX platform.
// The bot token comes from https://business.max.ru (Chat bots -> Integration),
// the bot has to be an administrator of the channel.
export class MaxProvider extends SocialAbstract implements SocialProvider {
  identifier = 'max';
  name = 'MAX';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'html' as const;
  toolTip =
    'Bot token from business.max.ru (Chat bots -> Integration). Add the bot to the channel as an administrator. Channel id: numeric chat_id (negative for channels), the bot sees it in GET /chats.';

  maxLength() {
    return 4000;
  }

  override handleErrors(body: string) {
    if (body.includes('attachment.not.ready')) {
      return { type: 'retry' as const, value: 'MAX is still processing the media' };
    }
    if (body.includes('verify.token') || body.includes('Invalid access_token')) {
      return { type: 'refresh-token' as const, value: 'MAX bot token is invalid, reconnect the channel' };
    }
    if (body.includes('chat.denied') || body.includes('not.found')) {
      return { type: 'bad-body' as const, value: 'The bot is not an administrator of this MAX channel' };
    }
    return undefined;
  }

  async customFields() {
    return [
      {
        key: 'token',
        label: 'MAX bot token',
        validation: `/^.{20,}$/`,
        type: 'password' as const,
      },
      {
        key: 'chatId',
        label: 'Channel chat_id (empty = first channel where the bot is admin)',
        validation: `/^(-?\\d+)?$/`,
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

  private async api<T = any>(
    token: string,
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const response = await this.fetch(`${MAX_API}${path}`, {
      ...init,
      headers: {
        Authorization: token,
        ...(init.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(init.headers || {}),
      },
      dispatcher: ruTrustedDispatcher(),
    } as RequestInit);
    return response.json();
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    try {
      const body = JSON.parse(Buffer.from(params.code, 'base64').toString());
      const token = String(body.token || '').trim();
      let chatId = String(body.chatId || '').trim();

      await this.api(token, '/me');

      if (!chatId) {
        const { chats = [] } = await this.api<{ chats: any[] }>(
          token,
          '/chats?count=100'
        );
        const channel =
          chats.find((c) => c.type === 'channel') || chats[0];
        if (!channel) {
          return 'The bot is not added to any MAX channel yet';
        }
        chatId = String(channel.chat_id);
      }

      const chat = await this.api(token, `/chats/${chatId}`);

      return {
        id: String(chat.chat_id || chatId),
        name: chat.title || `MAX ${chatId}`,
        accessToken: AuthService.signJWT({ token }),
        refreshToken: '',
        expiresIn: dayjs().add(200, 'year').unix() - dayjs().unix(),
        picture: chat.icon?.url || '',
        username: chat.link
          ? String(chat.link).split('/').pop() || String(chatId)
          : String(chatId),
      };
    } catch (e) {
      console.log(e);
      return 'Invalid MAX bot token or chat_id';
    }
  }

  private async upload(
    token: string,
    media: NonNullable<PostDetails['media']>[number]
  ) {
    const isVideo = ruIsVideo(media);
    const type = isVideo ? 'video' : 'image';
    const target = await this.api<{ url: string; token?: string }>(
      token,
      `/uploads?type=${type}`,
      { method: 'POST' }
    );

    const path = ruMediaPath(media.path);
    const file = await this.readOrFetch(path);
    const form = new FormData();
    form.append(
      'data',
      new Blob([new Uint8Array(file)], { type: ruMimeType(path) }),
      ruFileName(path)
    );

    const uploaded = await fetch(target.url, {
      method: 'POST',
      body: form,
      headers: { Authorization: token },
      // @ts-ignore undici option
      dispatcher: ruTrustedDispatcher(),
    });
    if (!uploaded.ok) {
      throw new BadBody(
        'max',
        await uploaded.text(),
        '{}',
        'MAX rejected the media upload'
      );
    }

    if (isVideo) {
      return { type: 'video', payload: { token: target.token } };
    }
    return { type: 'image', payload: await uploaded.json() };
  }

  private async send(
    token: string,
    chatId: string,
    post: PostDetails
  ): Promise<{ mid: string; url: string }> {
    const attachments = [];
    for (const media of post.media || []) {
      attachments.push(await this.upload(token, media));
    }

    const body = JSON.stringify({
      text: ruMaxHtml(post.message),
      format: 'html',
      ...(attachments.length ? { attachments } : {}),
    });

    // freshly uploaded media is processed asynchronously: MAX answers
    // attachment.not.ready until it is done
    for (let attempt = 0; ; attempt++) {
      try {
        const { message } = await this.api(
          token,
          `/messages?chat_id=${chatId}`,
          { method: 'POST', body }
        );
        return { mid: message?.body?.mid || '', url: message?.url || '' };
      } catch (err: any) {
        if (
          attempt < 10 &&
          JSON.stringify(err?.details || err?.message || '').includes(
            'attachment.not.ready'
          )
        ) {
          await timer(3000 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const { token } = AuthService.verifyJWT(accessToken) as any;
    const [firstPost] = postDetails;
    const { mid, url } = await this.send(token, id, firstPost);

    return [
      {
        id: firstPost.id,
        postId: mid,
        releaseURL: url,
        status: 'completed',
      },
    ];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    // MAX channels have no threads: follow-up parts go out as next messages
    const { token } = AuthService.verifyJWT(accessToken) as any;
    const [commentPost] = postDetails;
    const { mid, url } = await this.send(token, id, commentPost);

    return [
      {
        id: commentPost.id,
        postId: mid,
        releaseURL: url,
        status: 'completed',
      },
    ];
  }
}

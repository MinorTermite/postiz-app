import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { VkProvider } from '@gitroom/nestjs-libraries/integrations/social/vk.provider';
import { DashboardFunction } from '@gitroom/nestjs-libraries/integrations/dashboard.function.decorator';
import { ruPlainText } from './ru.media';

// Posts to the wall of a VK community on behalf of the community.
// Uses the same VK ID app as the personal VK channel (VK_ID); after the login
// the user picks one of the communities where they are an admin or editor.
// The VK ID app needs a second redirect: <FRONTEND_URL>/integrations/social/vk-group
export class VkGroupProvider extends VkProvider {
  override identifier = 'vk-group';
  override name = 'VK Community';
  override isBetweenSteps = true;
  override scopes = [
    'vkid.personal_info',
    'email',
    'wall',
    'groups',
    'docs',
    'photos',
    'video',
  ];
  override editor = 'normal' as const;

  override maxLength() {
    return 16384;
  }

  @DashboardFunction()
  async pages(accessToken: string) {
    const all = await (
      await this.fetch(
        `https://api.vk.ru/method/groups.get?v=5.251&access_token=${accessToken}&filter=admin,editor&extended=1&fields=photo_200,screen_name,members_count&count=1000`
      )
    ).json();
    this.checkApiError(all);

    return (all.response?.items || []).map((group: any) => ({
      id: String(group.id),
      name: group.name,
      username: group.screen_name || `club${group.id}`,
      picture: { data: { url: group.photo_200 || '' } },
      members: group.members_count || 0,
    }));
  }

  async fetchPageInformation(accessToken: string, data: { id: string }) {
    const groups = await this.pages(accessToken);
    const group = groups.find((item: any) => item.id === String(data.id));
    if (!group) {
      throw new Error('VK community not found or you are not its admin');
    }

    return {
      id: group.id,
      name: group.name,
      access_token: accessToken,
      picture: group.picture.data.url,
      username: group.username,
    };
  }

  async reConnect(
    id: string,
    requiredId: string,
    accessToken: string
  ): Promise<Omit<AuthTokenDetails, 'refreshToken' | 'expiresIn'>> {
    const information = await this.fetchPageInformation(accessToken, {
      id: requiredId,
    });

    return {
      id: information.id,
      name: information.name,
      accessToken: information.access_token,
      picture: information.picture,
      username: information.username,
    };
  }

  // groupId is the positive community id; the wall owner is -groupId
  override async post(
    groupId: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const mediaList = await this.uploadMedia(
      groupId,
      accessToken,
      firstPost,
      groupId
    );

    const body = new FormData();
    body.append('owner_id', `-${groupId}`);
    body.append('from_group', '1');
    body.append('message', ruPlainText(firstPost.message));
    if (mediaList.length) {
      body.append(
        'attachments',
        mediaList.map((p) => `${p.type}${p.ownerId}_${p.id}`).join(',')
      );
    }

    const all = await (
      await this.fetch(
        `https://api.vk.ru/method/wall.post?v=5.251&access_token=${accessToken}&client_id=${process.env.VK_ID}`,
        { method: 'POST', body }
      )
    ).json();
    this.checkApiError(all);
    const postId = String(all.response?.post_id);

    return [
      {
        id: firstPost.id,
        postId,
        releaseURL: `https://vk.com/wall-${groupId}_${postId}`,
        status: 'completed',
      },
    ];
  }

  override async comment(
    groupId: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;
    const mediaList = await this.uploadMedia(
      groupId,
      accessToken,
      commentPost,
      groupId
    );

    const body = new FormData();
    body.append('owner_id', `-${groupId}`);
    body.append('post_id', postId);
    body.append('from_group', groupId);
    body.append('message', ruPlainText(commentPost.message));
    if (mediaList.length) {
      body.append(
        'attachments',
        mediaList.map((p) => `${p.type}${p.ownerId}_${p.id}`).join(',')
      );
    }

    const all = await (
      await this.fetch(
        `https://api.vk.ru/method/wall.createComment?v=5.251&access_token=${accessToken}&client_id=${process.env.VK_ID}`,
        { method: 'POST', body }
      )
    ).json();
    this.checkApiError(all);

    return [
      {
        id: commentPost.id,
        postId: String(all.response?.comment_id),
        releaseURL: `https://vk.com/wall-${groupId}_${postId}`,
        status: 'completed',
      },
    ];
  }
}

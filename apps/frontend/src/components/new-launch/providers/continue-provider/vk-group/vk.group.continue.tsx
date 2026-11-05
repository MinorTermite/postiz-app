'use client';

import { withContinueProvider } from '../with-continue-provider';

interface VkGroupItem {
  id: string;
  name: string;
  username?: string;
  members?: number;
  picture?: {
    data: {
      url: string;
    };
  };
}

interface VkGroupSelection {
  id: string;
}

export const VkGroupContinue = withContinueProvider<
  VkGroupItem,
  VkGroupSelection
>({
  endpoint: 'pages',
  swrKey: 'load-vk-groups',
  titleKey: 'select_vk_group',
  titleDefault: 'Выберите сообщество VK:',
  emptyStateMessages: [
    {
      key: 'vk_group_not_found',
      text: 'Не найдено сообществ, где вы администратор или редактор.',
    },
    {
      key: 'vk_group_try_again',
      text: 'Закройте окно, удалите подключение и попробуйте снова.',
    },
  ],
  getItemId: (item) => item.id,
  getSelectionValue: (item) => ({ id: item.id }),
  transformSaveData: (selection) => selection,
  isSelected: (item, selection) => selection?.id === item.id,
  renderItem: (item) => (
    <>
      <div className="flex justify-center">
        {item.picture?.data?.url ? (
          <img
            className="w-[80px] h-[80px] object-cover rounded-full"
            src={item.picture.data.url}
            alt={item.name}
          />
        ) : (
          <div className="w-[80px] h-[80px] bg-input rounded-full flex items-center justify-center text-[32px] font-semibold">
            VK
          </div>
        )}
      </div>
      <div className="text-sm font-medium">{item.name}</div>
      {item.username && (
        <div className="text-xs text-gray-500 break-all">vk.com/{item.username}</div>
      )}
      {!!item.members && (
        <div className="text-xs text-gray-400">
          {item.members.toLocaleString('ru-RU')} участников
        </div>
      )}
    </>
  ),
});

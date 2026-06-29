import { describe, expect, it, vi } from 'vitest';
import { PostsRepository } from './posts.repository';

describe('PostsRepository', () => {
  describe('createPopularPosts', () => {
    it('persists the supplied popular post fields', async () => {
      const create = vi.fn().mockResolvedValue({ id: 'popular-1' });
      const repository = Object.create(PostsRepository.prototype) as PostsRepository;
      (repository as any)._popularPosts = {
        model: {
          popularPosts: { create },
        },
      };

      await repository.createPopularPosts({
        category: 'growth',
        topic: 'launch',
        content: 'Ship the update',
        hook: 'New feature',
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          category: 'growth',
          topic: 'launch',
          content: 'Ship the update',
          hook: 'New feature',
        },
      });
    });
  });

  describe('createOrUpdatePost tag lookup (I4c)', () => {
    it('excludes soft-deleted tags via deletedAt: null', async () => {
      const upsert = vi.fn().mockResolvedValue({ id: 'post-1' });
      const tagsDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
      const tagsFindMany = vi.fn().mockResolvedValue([{ id: 'tag-1' }]);
      const postUpdate = vi.fn().mockResolvedValue({ id: 'post-1' });

      const repository = Object.create(PostsRepository.prototype) as PostsRepository;
      (repository as any)._post = { model: { post: { upsert, update: postUpdate } } };
      (repository as any)._tagsPosts = {
        model: { tagsPosts: { deleteMany: tagsDeleteMany } },
      };
      (repository as any)._tags = { model: { tags: { findMany: tagsFindMany } } };

      await repository.createOrUpdatePost(
        'schedule',
        'org-1',
        new Date().toISOString(),
        {
          integration: { id: 'int-1' },
          settings: {},
          value: [{ id: 'post-1', content: 'hello', image: [] }],
        } as any,
        [{ value: 'launch', label: 'launch' }],
        'manual' as any
      );

      expect(tagsFindMany).toHaveBeenCalledTimes(1);
      const where = tagsFindMany.mock.calls[0][0].where;
      expect(where.deletedAt).toBeNull();
      expect(where.orgId).toBe('org-1');
    });
  });
});

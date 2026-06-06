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
});

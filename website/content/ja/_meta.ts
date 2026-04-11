export default {
  index: {
    type: 'page',
    display: 'hidden',
  },
  users: {
    type: 'page',
    title: 'ユーザーガイド',
  },
  developers: {
    type: 'page',
    title: 'デベロッパーガイド',
  },
  design: {
    type: 'page',
    title: 'デザイン',
  },
  showcase: {
    type: 'page',
    title: 'ショーケース',
    theme: {
      sidebar: false,
      layout: 'full'
    }
  },
  blog: {
    type: 'page',
    title: 'ブログ',
    theme: {
      sidebar: false,
      layout: 'full'
    }
  },
};
export default {
  index: {
    type: 'page',
    display: 'hidden',
  },
  users: {
    type: 'page',
    title: 'ユーザーガイド',
    theme: {
      breadcrumb: false,
    }
  },
  developers: {
    type: 'page',
    title: '開発者ガイド',
    theme: {
      breadcrumb: false,
    }
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
      breadcrumb: false,
      sidebar: false,
      layout: 'full'
    }
  },
};
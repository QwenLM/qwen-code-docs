export default {
  index: {
    type: 'page',
    display: 'hidden',
  },
  users: {
    type: 'page',
    title: '用户指南',
    theme: {
      breadcrumb: false,
    }
  },
  developers: {
    type: 'page',
    title: '开发者指南',
    theme: {
      breadcrumb: false,
    }
  },
  showcase: {
    type: 'page',
    title: '视频演示',
    theme: {
      sidebar: false,
      layout: 'full'
    }
  },
  blog: {
    type: 'page',
    title: '博客',
    theme: {
      breadcrumb: false,
      sidebar: false,
      layout: 'full'
    }
  },
};
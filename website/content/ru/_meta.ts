export default {
  index: {
    type: 'page',
    display: 'hidden',
  },
  users: {
    type: 'page',
    title: 'Руководство пользователя',
    theme: {
      breadcrumb: false,
    }
  },
  developers: {
    type: 'page',
    title: 'Руководство разработчика',
    theme: {
      breadcrumb: false,
    }
  },
  showcase: {
    type: 'page',
    title: 'Демонстрация',
    theme: {
      sidebar: false,
      layout: 'full'
    }
  },
  blog: {
    type: 'page',
    title: 'Блог',
    theme: {
      breadcrumb: false,
      sidebar: false,
      layout: 'full'
    }
  },
};
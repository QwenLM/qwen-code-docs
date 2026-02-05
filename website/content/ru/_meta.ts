export default {
  index: {
    type: 'page',
    display: 'hidden',
  },
  users: {
    type: 'page',
    title: 'Руководство пользователя',
  },
  developers: {
    type: 'page',
    title: 'Руководство разработчика',
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
      sidebar: false,
      layout: 'full'
    }
  },
};
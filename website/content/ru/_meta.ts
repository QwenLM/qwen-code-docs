export default {
  index: {
    type: 'page',
    display: 'hidden',
  },
  users: {
    type: 'page',
    title: 'Руководство для пользователей',
  },
  developers: {
    type: 'page',
    title: 'Руководство для разработчиков',
  },
  design: {
    type: 'page',
    title: 'Дизайн',
  },
  showcase: {
    type: 'page',
    title: 'Витрина',
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
export default {
  index: {
    type: 'page',
    display: 'hidden',
  },
  users: {
    type: 'page',
    title: 'Guide de l\'utilisateur',
    theme: {
      breadcrumb: false,
    }
  },
  developers: {
    type: 'page',
    title: 'Guide du développeur',
    theme: {
      breadcrumb: false,
    }
  },
  showcase: {
    type: 'page',
    title: 'Présentation',
    theme: {
      sidebar: false,
      layout: 'full'
    }
  },
  blog: {
    type: 'page',
    title: 'Blog',
    theme: {
      breadcrumb: false,
      sidebar: false,
      layout: 'full'
    }
  },
};
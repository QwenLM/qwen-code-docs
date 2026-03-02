export default {
  index: {
    type: 'page',
    display: 'hidden',
  },
  users: {
    type: 'page',
    title: 'Benutzerhandbuch',
    theme: {
      breadcrumb: false,
    }
  },
  developers: {
    type: 'page',
    title: 'Entwicklerhandbuch',
    theme: {
      breadcrumb: false,
    }
  },
  showcase: {
    type: 'page',
    title: 'Vorführung',
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
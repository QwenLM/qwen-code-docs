export default {
  index: {
    type: 'page',
    display: 'hidden',
  },
  users: {
    type: 'page',
    title: 'Guia do Usuário',
    theme: {
      breadcrumb: false,
    }
  },
  developers: {
    type: 'page',
    title: 'Guia do Desenvolvedor',
    theme: {
      breadcrumb: false,
    }
  },
  showcase: {
    type: 'page',
    title: 'Demonstração',
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
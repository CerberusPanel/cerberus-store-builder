export const starterStore = {
  name: 'Store',
  version: '0.0.0',
  description: '',
  author: '',
  apps: [],
}

export function createBlankApp(index = 1) {
  const id = `new-app-${index}`
  return {
    id,
    name: 'New App',
    description: '',
    category: '',
    image: '',
    tags: [],
    highlights: [],
    readme: '',
    versions: [{ tag: 'latest', label: 'Latest' }],
    links: {},
    deployments: {
      latest: {
        container_name: id,
        image: '',
        ports: [],
        volumes: [],
      },
    },
  }
}

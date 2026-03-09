import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/Home.vue';
import Docs from '../views/Docs.vue';
import Roadmap from '../views/Roadmap.vue';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,
  },
  {
    path: '/docs',
    name: 'Docs',
    component: Docs,
  },
  {
    path: '/roadmap',
    name: 'Roadmap',
    component: Roadmap,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0 };
  },
});

export default router;

import { createRouter, createWebHistory } from 'vue-router'
import AdminView from './views/AdminView.vue'
import CatalogView from './views/CatalogView.vue'
import HomeView from './views/HomeView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/catalog',
      name: 'catalog',
      component: CatalogView,
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
    },
  ],
})

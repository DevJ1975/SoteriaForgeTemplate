import { createRouter, createWebHistory } from 'vue-router'
import AdminView from './views/AdminView.vue'
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
      path: '/admin',
      name: 'admin',
      component: AdminView,
    },
  ],
})

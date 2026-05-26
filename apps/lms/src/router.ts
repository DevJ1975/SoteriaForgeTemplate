import { createRouter, createWebHistory } from 'vue-router'
import AdminView from './views/AdminView.vue'
import CheckoutSuccessView from './views/CheckoutSuccessView.vue'
import ContactView from './views/ContactView.vue'
import CourseCatalogView from './views/CourseCatalogView.vue'
import CourseDetailView from './views/CourseDetailView.vue'
import HomeView from './views/HomeView.vue'
import LegalView from './views/LegalView.vue'
import PricingView from './views/PricingView.vue'
import PublicLandingView from './views/PublicLandingView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: PublicLandingView,
    },
    {
      path: '/login',
      name: 'login',
      component: HomeView,
    },
    {
      path: '/courses',
      name: 'courses',
      component: CourseCatalogView,
    },
    {
      path: '/courses/:slug',
      name: 'course-detail',
      component: CourseDetailView,
    },
    {
      path: '/pricing',
      name: 'pricing',
      component: PricingView,
    },
    {
      path: '/catalog',
      name: 'catalog',
      redirect: '/pricing',
    },
    {
      path: '/checkout/success',
      name: 'checkout-success',
      component: CheckoutSuccessView,
    },
    {
      path: '/contact',
      name: 'contact',
      component: ContactView,
    },
    {
      path: '/terms',
      name: 'terms',
      component: LegalView,
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: LegalView,
    },
    {
      path: '/refund-policy',
      name: 'refund-policy',
      component: LegalView,
    },
    {
      path: '/accessibility',
      name: 'accessibility',
      component: LegalView,
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
    },
  ],
})

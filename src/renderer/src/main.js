import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import App from './App.vue'
import Dashboard from './views/Dashboard.vue'
import MapView from './views/MapView.vue'
import Settings from './views/Settings.vue'
import Prices from './views/Prices.vue'
import Tasks from './views/Tasks.vue'
import TaskDetail from './views/TaskDetail.vue'
import { t } from './i18n'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/map/:map?', component: MapView },
    { path: '/prices', component: Prices },
    { path: '/tasks', component: Tasks },
    { path: '/tasks/:id', component: TaskDetail },
    { path: '/settings', component: Settings }
  ]
})

const app = createApp(App).use(router)
app.config.globalProperties.$t = t
app.mount('#app')

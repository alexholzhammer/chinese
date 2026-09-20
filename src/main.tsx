import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { Shell } from './app/Shell'
import { Dashboard } from './app/Dashboard'
import { Review } from './app/Review'
import { Calibrate } from './app/Calibrate'
import { Library } from './app/Library'
import { Settings } from './app/Settings'
import { TtsCheck } from './app/TtsCheck'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'review', element: <Review /> },
      { path: 'calibrate', element: <Calibrate /> },
      { path: 'library', element: <Library /> },
      { path: 'settings', element: <Settings /> },
      { path: 'tts-check', element: <TtsCheck /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

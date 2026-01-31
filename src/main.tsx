import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './App.css'
import { StaffingApp } from './staffing/StaffingApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <StaffingApp />
    </BrowserRouter>
  </StrictMode>,
)


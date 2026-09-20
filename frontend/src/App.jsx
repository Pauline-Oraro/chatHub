

import {  useAuth } from '@clerk/react'
import { ThemeProvider } from './context/ThemeContext'
import { WallpaperProvider } from './context/WallpaperContext'
import { Navigate, Route, Routes } from 'react-router'
import ChatPage from './pages/ChatPage'
import AuthPage from './pages/AuthPage'

function App() {

  // check if you are authenticated user and if clerk is loaded
  const {isSignedIn, isLoaded} = useAuth()

  if (!isLoaded) return <p>loading...</p>


  return (
    <ThemeProvider>
      <WallpaperProvider>
        <Routes>
          <Route path="/" element={isSignedIn ? <ChatPage /> : <Navigate to={"/auth"} replace />} />
          <Route path="/auth" element={!isSignedIn ? <AuthPage /> : <Navigate to={"/"} replace />} />
        </Routes>
    </WallpaperProvider>
    </ThemeProvider>
  )
}

export default App

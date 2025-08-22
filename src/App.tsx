import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import ConfIAbleARTDemo from "./ConfIAbleARTDemo";

export default function Page() {
  return <ConfIAbleARTDemo apiUrl={process.env.NEXT_PUBLIC_CONFIABLE_API} />;
}


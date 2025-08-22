import './App.css'
import ConfIAbleARTDemo from "./ConfIAbleARTDemo";

export default function Page() {
  return <ConfIAbleARTDemo apiUrl={process.env.NEXT_PUBLIC_CONFIABLE_API} />;
}


import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Iniciar sesion — NEO PULSE',
};

export default function LoginPage() {
  return <LoginForm />;
}

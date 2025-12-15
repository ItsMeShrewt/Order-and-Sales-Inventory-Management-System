import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import { OrderIcon, EyeCloseIcon, EyeIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Checkbox from "../form/input/Checkbox";
import Button from "../ui/button/Button";
import api from "../../lib/axios";
import { toast } from 'sonner';
export default function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  
  return (
    <div className="flex flex-col flex-1">
      <div className="w-full max-w-md pt-10 mx-auto">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
        </Link>
      </div>
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Sign In
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Admin Login — For customers, please continue to “Order”.
            </p>
          </div>
          <div>
            <div className="flex justify-center">
              <Link to="/user_order">
                <button className="inline-flex items-center justify-center gap-3 py-3 text-sm font-semibold text-gray-700 transition-colors bg-gray-100 rounded-lg px-7 hover:bg-gray-200 hover:text-gray-800 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10">
                  <OrderIcon className="font-semibold w-5 h-5" />
                  ORDER
                </button>
              </Link>
            </div>
            <div className="relative py-3 sm:py-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="p-2 text-gray-400 bg-white dark:bg-gray-900 sm:px-5 sm:py-2">
                  Or
                </span>
              </div>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setLoading(true);
                try {
                  // Map username to email if no @ present (seed uses admin@example.com)
                  const email = String(username || '').includes('@') ? username : `${username}@example.com`;
                  // Ensure CSRF cookie is present (Laravel Sanctum) before login
                  try {
                    await fetch('/sanctum/csrf-cookie', { credentials: 'include' });
                  } catch {
                    // ignore if fetch fails; backend may not require CSRF
                  }
                  const resp = await api.post('/login', { email, password });
                  // If backend returns a token, store it and set default header
                  const token = resp?.data?.token;
                  if (token) {
                    localStorage.setItem('api_token', token);
                    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                  }
                  // Show a non-blocking toast (sonner) and navigate shortly after
                  try {
                    toast.success('Successfully logged in — redirecting...');
                  } catch {}
                  // If user was redirected to sign-in while trying to access a protected route,
                  // navigate them back to that path after login (default to /dashboard)
                  const from = (location.state as any)?.from?.pathname || '/dashboard';
                  setTimeout(() => navigate(from), 300);
                } catch (err: unknown) {
                  // Helpful network error handling — axios throws a message 'Network Error'
                  let message = 'Login failed';
                  if (err && typeof err === 'object') {
                    // Prefer backend message when available
                    message = (err as any)?.response?.data?.message || (err as any)?.message || message;
                  } else if (typeof err === 'string') {
                    message = err;
                  }

                  // If this is a connectivity error, make the message actionable
                  if (String(message).toLowerCase().includes('network error')) {
                    message = 'Network error — could not reach the API. Make sure the backend (Laravel) is running (http://127.0.0.1:8000) and that you started the frontend dev server (npm run dev) so the /api proxy is active.';
                  }

                  setError(message);
                } finally {
                  setLoading(false);
                }
              }}
            >
              <div className="space-y-6">
                <div>
                  <Label>
                    Admin Username <span className="text-error-500">*</span>{" "}
                  </Label>
                  <Input placeholder="admin or admin@example.com" value={username} onChange={(e) => setUsername((e.target as HTMLInputElement).value)} />
                </div>
                <div>
                  <Label>
                    Password <span className="text-error-500">*</span>{" "}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
                    />
                    <span
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                    >
                      {showPassword ? (
                        <EyeIcon className="fill-gray-500 dark:fill-gray-400 size-5" />
                      ) : (
                        <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400 size-5" />
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={isChecked} onChange={setIsChecked} />
                    <span className="block font-normal text-gray-700 text-theme-sm dark:text-gray-400">
                      Keep me logged in
                    </span>
                  </div>
                </div>
                {error && <div className="text-sm text-red-500">{error}</div>}
                <div>
                  <Button className="w-full" size="sm" type="submit" disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign in'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

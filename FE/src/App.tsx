import { BrowserRouter as Router, Routes, Route } from "react-router";
import SignIn from "./pages/AuthPages/SignIn";
import NotFound from "./pages/OtherPage/NotFound";
import UserProfiles from "./pages/UserProfiles";
import AppLayout from "./layout/AppLayout";
import ProtectedRoute from "./components/common/ProtectedRoute";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
import Products from "./pages/Products/products";
import Orders from "./pages/Orders/orders";
import OrderPage from "./pages/OrderPage/orderpage";
import OrderHistory from "./pages/Orders/order-history";
import SalesReport from "./pages/Reports/SalesReport";
import DamageReport from "./pages/Reports/DamageReport";
import { OrderProvider } from "./context/OrderContext";
import { ProductNotificationProvider } from "./context/ProductNotificationContext";
import Category from "./components/form/Category";
import { Toaster } from 'sonner';
import UserOrder from "./pages/user/user_order";
import InventoryReport from "./pages/Reports/InventoryReport";


export default function App() {
  return (
    <OrderProvider>
      <ProductNotificationProvider>
        <Toaster position="top-right" expand={false} richColors />
        <Router>
          <ScrollToTop />
        <Routes>
          {/* Dashboard Layout (requires auth) */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index path="/dashboard" element={<Home />} />

            {/* Others Page */}
            <Route path="/profile" element={<UserProfiles />} />

            {/* Forms */}
            <Route path="/category" element={<Category />} />

            <Route path="/orders" element={<Orders />} />
            <Route path="/orderpage" element={<OrderPage />} />
            <Route path="/order-history" element={<OrderHistory />} />

            {/* Tables */}
            <Route path="/products" element={<Products />} />
            <Route path="/reports/sales" element={<SalesReport />} />
            <Route path="/reports/damage" element={<DamageReport />} />
            <Route path="/inventory" element={<InventoryReport />} />
          </Route>

          {/* Auth Layout */}
          <Route path="/" element={<SignIn />} />
          
          {/* Public Route - User Order (no auth required) */}
          <Route path="/user_order" element={<UserOrder />} />

          {/* Fallback Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
      </ProductNotificationProvider>
    </OrderProvider>
  );
}

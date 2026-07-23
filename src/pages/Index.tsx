import { useApp } from "@/contexts/AppContext";
import { ConsumerApp } from "@/components/consumer/ConsumerApp";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

const Index = () => {
  const { isAdmin } = useApp();

  return isAdmin ? <AdminDashboard /> : <ConsumerApp />;
};

export default Index;

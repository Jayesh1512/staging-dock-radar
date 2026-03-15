import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Dashboard } from '@/components/Dashboard';

function App() {
  return (
    <TooltipProvider>
      <Dashboard />
      <Toaster position="bottom-right" richColors />
    </TooltipProvider>
  );
}

export default App;

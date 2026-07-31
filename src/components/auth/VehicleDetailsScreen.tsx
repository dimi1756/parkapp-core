import React, { useState } from 'react';
import { useAuth, maskPlate } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Car, Loader2, ShieldCheck } from 'lucide-react';

export const VehicleDetailsScreen = () => {
  const { saveVehicleDetails } = useAuth();
  const { t } = useLanguage();
  const [make, setMake] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!make.trim() || !color.trim() || !plate.trim()) {
      toast({ title: t('vehicle.missingDetails'), description: t('vehicle.missingDetailsDesc'), variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await saveVehicleDetails({ make, color, plate: plate.toUpperCase() });
    setSubmitting(false);
    if (error) {
      toast({ title: t('vehicle.saveFailed'), description: error, variant: 'destructive' });
    }
  };

  return (
    <div className="h-[100dvh] w-full max-w-md mx-auto bg-background flex flex-col overflow-y-auto">
      <div className="flex-1 flex flex-col justify-center p-6">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Car className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{t('vehicle.title')}</h1>
          <p className="text-muted-foreground text-sm text-center">
            {t('vehicle.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="make">{t('vehicle.make')}</Label>
            <Input id="make" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="color">{t('vehicle.color')}</Label>
            <Input id="color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="Silver" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plate">{t('vehicle.plate')}</Label>
            <Input id="plate" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ABC-1234" />
            {plate.trim().length > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t('vehicle.shownAs')} <span className="font-mono font-medium text-foreground">{maskPlate(plate)}</span>
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('vehicle.continue')}
          </Button>
        </form>
      </div>
    </div>
  );
};

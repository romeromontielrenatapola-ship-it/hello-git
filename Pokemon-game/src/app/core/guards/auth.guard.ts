import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

export const authGuard = async (): Promise<boolean> => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  try {
    const { data: { session } } = await supabase.client.auth.getSession();
    if (session) {
      return true;
    }
  } catch (err) {
    console.error('Error en AuthGuard:', err);
  }

  // Redirect to login
  router.navigate(['/login']);
  return false;
};

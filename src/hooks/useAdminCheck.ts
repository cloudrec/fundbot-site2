import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AdminInfo {
  isAdmin: boolean;
  role: string;
  permissions: string[];
  userEmail: string | null;
  loading: boolean;
}

export const useAdminCheck = () => {
  const [adminInfo, setAdminInfo] = useState<AdminInfo>({
    isAdmin: false,
    role: 'user',
    permissions: [],
    userEmail: null,
    loading: true
  });

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        // Получаем текущего пользователя
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user?.email) {
          setAdminInfo({
            isAdmin: false,
            role: 'user',
            permissions: [],
            userEmail: null,
            loading: false
          });
          return;
        }

        // Проверяем админские права через view
        const { data, error } = await supabase
          .from('current_user_admin_info')
          .select('*')
          .single();

        if (error) {
          console.error('Ошибка проверки админских прав:', error);
          setAdminInfo({
            isAdmin: false,
            role: 'user',
            permissions: [],
            userEmail: user.email,
            loading: false
          });
          return;
        }

        setAdminInfo({
          isAdmin: data.is_admin || false,
          role: data.role || 'user',
          permissions: data.permissions || [],
          userEmail: user.email,
          loading: false
        });

      } catch (error) {
        console.error('Ошибка при проверке админских прав:', error);
        setAdminInfo({
          isAdmin: false,
          role: 'user',
          permissions: [],
          userEmail: null,
          loading: false
        });
      }
    };

    checkAdminStatus();

    // Подписываемся на изменения аутентификации
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAdminStatus();
    });

    return () => subscription.unsubscribe();
  }, []);

  const hasPermission = (permission: string): boolean => {
    return adminInfo.permissions.includes(permission) || adminInfo.permissions.includes('full_access');
  };

  return {
    ...adminInfo,
    hasPermission
  };
};

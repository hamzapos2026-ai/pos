import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Settings, Save } from 'lucide-react';
import PageHeader from '../../components/admin/PageHeader';
import Button from '../../components/ui/Button';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../utils/cn';

const RoleSettings = () => {
  const { role } = useParams();
  const { isDark } = useTheme();
  
  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <PageHeader 
        icon={Settings} 
        title={`${role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Role'} Settings`} 
        description={`Manage specific settings and limits for ${role || 'this role'}.`}
        actions={<Button leftIcon={<Save className="w-4 h-4" />}>Save Settings</Button>}
      />
      <div className={cn('rounded-2xl border p-8 text-center', isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200')}>
        <p className={cn('text-lg font-semibold', isDark ? 'text-gray-300' : 'text-gray-700')}>
          Settings configuration for {role} will go here.
        </p>
      </div>
    </div>
  );
};

export default RoleSettings;

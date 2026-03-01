import React from 'react';
import { Team } from '../types';

interface TeamBadgeProps {
  team: Team | { name: string; primaryColor: string; secondaryColor: string; city?: string };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showName?: boolean;
  className?: string;
}

const TeamBadge: React.FC<TeamBadgeProps> = ({ team, size = 'md', showName = false, className = "" }) => {
  const sizeClasses = {
    xs: 'w-6 h-6 text-[8px]',
    sm: 'w-8 h-8 text-[10px]',
    md: 'w-10 h-10 text-xs',
    lg: 'w-16 h-16 text-sm',
    xl: 'w-24 h-24 text-lg',
  };

  const initials = team.name.substring(0, 2).toUpperCase();
  
  // Determine text color based on background luminance or just use white/black
  // For simplicity, we'll use white text with a subtle shadow or secondary color for border
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div 
        className={`${sizeClasses[size]} rounded-lg flex items-center justify-center font-black text-white shadow-lg border-b-2 border-black/20 shrink-0`}
        style={{ backgroundColor: team.primaryColor, borderColor: team.secondaryColor }}
      >
        {initials}
      </div>
      {showName && (
        <span className="font-display font-bold text-slate-200 uppercase tracking-tight">
          {team.name}
        </span>
      )}
    </div>
  );
};

export default TeamBadge;

import React from 'react';
import { Team } from '../types';

// Domains that are known stock-photo fallbacks — never show these as logos
const STOCK_DOMAINS = ['picsum.photos', 'placeholder.com', 'unsplash.com', 'via.placeholder'];
const isValidLogo = (url?: string): boolean => {
  if (!url || url.trim() === '') return false;
  return !STOCK_DOMAINS.some(d => url.includes(d));
};

type TeamBadgeProp = Team | {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  city?: string;
  logo?: string;
  abbreviation?: string;
};

interface TeamBadgeProps {
  team: TeamBadgeProp;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showName?: boolean;
  className?: string;
  useSecondary?: boolean;
}

const TeamBadge: React.FC<TeamBadgeProps> = ({ team, size = 'md', showName = false, className = '', useSecondary = false }) => {
  const [imgError, setImgError] = React.useState(false);

  // Reset error state if logo URL changes
  const primaryLogoUrl = (team as any).logo as string | undefined;
  const secondaryLogoUrl = (team as any).secondaryLogo as string | undefined;
  const logoUrl = useSecondary && secondaryLogoUrl ? secondaryLogoUrl : primaryLogoUrl;
  const prevLogoRef = React.useRef(logoUrl);
  React.useEffect(() => {
    if (prevLogoRef.current !== logoUrl) {
      setImgError(false);
      prevLogoRef.current = logoUrl;
    }
  }, [logoUrl]);

  const sizeClasses = {
    xs: 'w-6 h-6 text-[8px]',
    sm: 'w-8 h-8 text-[10px]',
    md: 'w-10 h-10 text-xs',
    lg: 'w-16 h-16 text-sm',
    xl: 'w-24 h-24 text-lg',
  };

  const abbr = (team as any).abbreviation as string | undefined;
  // Prefer abbreviation (2-3 chars), else first 2 chars of name
  const initials = abbr
    ? abbr.substring(0, 3).toUpperCase()
    : team.name.substring(0, 2).toUpperCase();

  const showImg = !imgError && isValidLogo(logoUrl);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`${sizeClasses[size]} rounded-lg flex items-center justify-center font-black text-white shadow-lg border-b-2 border-black/20 shrink-0 overflow-hidden`}
        style={{ backgroundColor: team.primaryColor, borderColor: team.secondaryColor }}
      >
        {showImg ? (
          <img
            src={logoUrl}
            alt=""
            className="w-full h-full object-contain"
            onError={() => setImgError(true)}
            referrerPolicy="no-referrer"
          />
        ) : (
          initials
        )}
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

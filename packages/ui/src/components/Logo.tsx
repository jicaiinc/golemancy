import logoUrl from '../assets/logo.png';

export type LogoProps = { size?: number; alt?: string };

export function Logo({ size = 22, alt = 'Golemancy' }: LogoProps) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt={alt}
      draggable={false}
      style={{ display: 'block', width: size, height: size, userSelect: 'none' }}
    />
  );
}

export { logoUrl };

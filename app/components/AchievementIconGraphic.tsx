type AchievementIconGraphicProps = {
  icon: string;
  alt?: string;
};

function isImageIcon(icon: string) {
  return icon.startsWith("data:image/")
    || icon.startsWith("/uploads/")
    || icon.startsWith("https://")
    || icon.startsWith("http://");
}

export function AchievementIconGraphic({ icon, alt = "" }: AchievementIconGraphicProps) {
  if (!isImageIcon(icon)) return <>{icon}</>;

  return (
    // Achievement images may be browser-generated data URLs or server upload paths.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="achievement-icon-image" src={icon} alt={alt} />
  );
}

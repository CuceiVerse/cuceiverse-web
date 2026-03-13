import { ModularReadOnlyMap } from '../features/campus-map/components/ModularReadOnlyMap';
import './HomeView.css';

export const HomeView = () => {
  return (
    <div className="home-container animate-fade-in">
      <ModularReadOnlyMap />
    </div>
  );
};

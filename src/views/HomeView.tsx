import { MapaInteractivoViewer } from '../features/campus-map/components/MapaInteractivoViewer';
import './HomeView.css';

export const HomeView = () => {
  return (
    <div className="home-container animate-fade-in">
      <MapaInteractivoViewer />
    </div>
  );
};

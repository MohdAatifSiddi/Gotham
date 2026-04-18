import { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Html } from '@react-three/drei';
import * as THREE from 'three';
import { PlanetaryEvent, EVENT_COLORS, RISK_COLORS } from '@/types/events';

function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function Earth() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.02;
    }
  });

  return (
    <group>
      {/* Earth sphere */}
      <Sphere ref={meshRef} args={[2, 64, 64]}>
        <meshStandardMaterial
          color="#1a3a5c"
          emissive="#0a1a2e"
          emissiveIntensity={0.3}
          wireframe={false}
          roughness={0.8}
          metalness={0.2}
        />
      </Sphere>
      {/* Wireframe overlay */}
      <Sphere args={[2.005, 32, 32]}>
        <meshBasicMaterial
          color="#3B82F6"
          wireframe
          transparent
          opacity={0.08}
        />
      </Sphere>
      {/* Atmosphere glow */}
      <Sphere args={[2.15, 32, 32]}>
        <meshBasicMaterial
          color="#3B82F6"
          transparent
          opacity={0.05}
          side={THREE.BackSide}
        />
      </Sphere>
    </group>
  );
}

function EventMarker({
  event,
  onClick,
  isSelected,
}: {
  event: PlanetaryEvent;
  onClick: (e: PlanetaryEvent) => void;
  isSelected: boolean;
}) {
  const position = useMemo(
    () => latLngToVector3(event.latitude, event.longitude, 2.02),
    [event.latitude, event.longitude]
  );
  const color = EVENT_COLORS[event.type];
  const scale = 0.02 + event.severity * 0.04;
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ref.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 3 + event.severity * 10) * 0.3;
      ref.current.scale.setScalar(isSelected ? s * 1.5 : s);
    }
  });

  return (
    <mesh
      ref={ref}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
    >
      <sphereGeometry args={[scale, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} />
    </mesh>
  );
}

function GlobeScene({
  events,
  selectedEvent,
  onSelectEvent,
}: {
  events: PlanetaryEvent[];
  selectedEvent: PlanetaryEvent | null;
  onSelectEvent: (e: PlanetaryEvent | null) => void;
}) {
  // Limit markers to top 200 for performance
  const visibleEvents = useMemo(() => {
    return events
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 200);
  }, [events]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 3, 5]} intensity={0.8} />
      <pointLight position={[-5, -3, -5]} intensity={0.3} color="#3B82F6" />

      <Earth />

      {visibleEvents.map((event) => (
        <EventMarker
          key={event.id}
          event={event}
          onClick={onSelectEvent}
          isSelected={selectedEvent?.id === event.id}
        />
      ))}

      <OrbitControls
        enablePan={false}
        minDistance={3}
        maxDistance={8}
        rotateSpeed={0.5}
        zoomSpeed={0.8}
        autoRotate
        autoRotateSpeed={0.3}
      />
    </>
  );
}

interface EarthGlobeProps {
  events: PlanetaryEvent[];
  selectedEvent: PlanetaryEvent | null;
  onSelectEvent: (e: PlanetaryEvent | null) => void;
}

export default function EarthGlobe({ events, selectedEvent, onSelectEvent }: EarthGlobeProps) {
  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <GlobeScene
          events={events}
          selectedEvent={selectedEvent}
          onSelectEvent={onSelectEvent}
        />
      </Canvas>
    </div>
  );
}

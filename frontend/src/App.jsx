import React from 'react';
import KubernetesGenerator from './components/KubernetesGenerator';

function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0b1120',
        color: '#e5e7eb',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: '0.9rem 1.75rem',
          borderBottom: '1px solid #1f2937',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#020617',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background:
                'radial-gradient(circle at 10% 0%, #22c55e 0, #0ea5e9 35%, #6366f1 70%)',
            }}
          />
          <div>
            <h1
              style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                letterSpacing: 0.4,
              }}
            >
              DevOps Manifest Factory
            </h1>
            <p
              style={{
                fontSize: '0.75rem',
                color: '#9ca3af',
                marginTop: 2,
              }}
            >
              Local IaC generator · Kubernetes module
            </p>
          </div>
        </div>
        <span
          style={{
            fontSize: '0.75rem',
            color: '#6b7280',
            borderRadius: 999,
            border: '1px solid #1f2937',
            padding: '0.15rem 0.6rem',
          }}
        >
          Dark mode · Offline friendly
        </span>
      </header>

      <main
        style={{
          padding: '1.25rem 1.75rem 1.75rem',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        <KubernetesGenerator />
      </main>
    </div>
  );
}

export default App;














// import React from 'react';
// import KubernetesGenerator from './components/KubernetesGenerator';

// function App() {
//   return (
//     <div style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh' }}>
//       <header
//         style={{
//           padding: '1rem 2rem',
//           borderBottom: '1px solid #e5e7eb',
//           display: 'flex',
//           justifyContent: 'space-between',
//           alignItems: 'center',
//         }}
//       >
//         <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
//           DevOps Manifest Factory
//         </h1>
//         <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>
//           Local MERN – MVP (Kubernetes)
//         </span>
//       </header>

//       <main style={{ padding: '1.5rem 2rem' }}>
//         {/* Later: tabs for Kubernetes / Docker / Ansible / Terraform */}
//         <KubernetesGenerator />
//       </main>
//     </div>
//   );
// }

// export default App;

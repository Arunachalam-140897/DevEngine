import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const emptyTier = () => ({
  name: '',
  replicas: 1,
  image: '',
  containerPort: 80,
  serviceType: 'ClusterIP',
  servicePort: 80,
  ingressHost: '',
  ingressPath: '/',
  workloadType: 'Deployment', // Deployment | StatefulSet
  env: [],
  configMapData: [],
  secretData: [],
  pvcEnabled: false,
  pvcStorageClass: '',
  pvcSize: '',
  pvcMountPath: '',
  pvcAccessMode: 'ReadWriteOnce',
  // PV controls (user-selectable)
  pvType: 'none', // none | hostPath | nfs
  pvStorageClass: '',
  pvSize: '',
  pvAccessMode: 'ReadWriteOnce',
  pvReclaimPolicy: 'Retain',
  pvHostPath: '',
  pvNfsServer: '',
  pvNfsPath: '',
});

// Some handy presets
const K8S_PRESETS = [
  {
    key: 'none',
    label: 'Empty (manual config)',
    apply: () => ({
      appName: 'my-app',
      namespace: 'dev',
      tiers: [emptyTier()],
    }),
  },
  {
    key: 'nginx',
    label: 'Nginx Web (Deployment + Ingress)',
    apply: () => ({
      appName: 'nginx-web',
      namespace: 'web',
      tiers: [
        {
          ...emptyTier(),
          name: 'web',
          replicas: 2,
          image: 'nginx:1.27',
          containerPort: 80,
          serviceType: 'ClusterIP',
          servicePort: 80,
          ingressHost: 'nginx.local',
          ingressPath: '/',
          workloadType: 'Deployment',
        },
      ],
    }),
  },
  {
    key: 'node-api',
    label: 'Node.js API (Deployment)',
    apply: () => ({
      appName: 'node-api',
      namespace: 'api',
      tiers: [
        {
          ...emptyTier(),
          name: 'api',
          replicas: 2,
          image: 'node:20-alpine',
          containerPort: 3000,
          serviceType: 'ClusterIP',
          servicePort: 3000,
          workloadType: 'Deployment',
          env: [
            { name: 'NODE_ENV', value: 'production' },
            { name: 'PORT', value: '3000' },
          ],
        },
      ],
    }),
  },
  {
    key: 'mongo-stateful',
    label: 'MongoDB (StatefulSet + PVC + PV hostPath)',
    apply: () => ({
      appName: 'mongo',
      namespace: 'data',
      tiers: [
        {
          ...emptyTier(),
          name: 'db',
          replicas: 1,
          image: 'mongo:6',
          containerPort: 27017,
          serviceType: 'ClusterIP',
          servicePort: 27017,
          workloadType: 'StatefulSet',
          pvcEnabled: true,
          pvcSize: '10Gi',
          pvcMountPath: '/data/db',
          pvcAccessMode: 'ReadWriteOnce',
          pvType: 'hostPath',
          pvSize: '10Gi',
          pvAccessMode: 'ReadWriteOnce',
          pvReclaimPolicy: 'Retain',
          pvHostPath: '/mnt/data/mongo',
        },
      ],
    }),
  },
];

function KubernetesGenerator() {
  const [appName, setAppName] = useState('my-app');
  const [namespace, setNamespace] = useState('dev');
  const [createNamespace, setCreateNamespace] = useState(true);
  const [enableRBAC, setEnableRBAC] = useState(false);
  const [tiers, setTiers] = useState([emptyTier()]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState(null);
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedTemplateContent, setSelectedTemplateContent] = useState(null);
  const [presetKey, setPresetKey] = useState('none');

  const applyPreset = (key) => {
    const preset = K8S_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    const { appName, namespace, tiers } = preset.apply();
    setAppName(appName);
    setNamespace(namespace);
    setTiers(tiers);
    setFiles(null);
    setErrors([]);
  };

  const updateTier = (index, key, value) => {
    const copy = [...tiers];
    copy[index] = { ...copy[index], [key]: value };
    setTiers(copy);
  };

  const addTier = () => setTiers([...tiers, emptyTier()]);

  const removeTier = (index) => {
    if (tiers.length === 1) return;
    setTiers(tiers.filter((_, i) => i !== index));
  };

  // ---- Env / ConfigMap / Secret handlers ----
  const addKeyValue = (index, field) => {
    const copy = [...tiers];
    copy[index] = {
      ...copy[index],
      [field]: [...(copy[index][field] || []), { name: '', value: '', key: '' }],
    };
    setTiers(copy);
  };

  const updateKeyValue = (tierIndex, field, rowIndex, key, value) => {
    const copy = [...tiers];
    const arr = [...(copy[tierIndex][field] || [])];
    arr[rowIndex] = { ...arr[rowIndex], [key]: value };
    copy[tierIndex][field] = arr;
    setTiers(copy);
  };

  const removeKeyValue = (tierIndex, field, rowIndex) => {
    const copy = [...tiers];
    const arr = [...(copy[tierIndex][field] || [])];
    arr.splice(rowIndex, 1);
    copy[tierIndex][field] = arr;
    setTiers(copy);
  };

  const validate = () => {
    const errs = [];
    if (!appName.trim()) errs.push('App name is required');
    if (!namespace.trim()) errs.push('Namespace is required');

    tiers.forEach((tier, i) => {
      if (!tier.name.trim()) errs.push(`Tier #${i + 1}: name is required`);
      if (!tier.image.trim()) errs.push(`Tier #${i + 1}: image is required`);
      if (!tier.containerPort) errs.push(`Tier #${i + 1}: container port is required`);
      if (tier.pvcEnabled) {
        if (!tier.pvcSize.trim()) {
          errs.push(`Tier #${i + 1}: PVC size is required when storage is enabled`);
        }
        if (!tier.pvcMountPath.trim()) {
          errs.push(`Tier #${i + 1}: PVC mount path is required when storage is enabled`);
        }
      }
      if (tier.pvType === 'nfs') {
        if (!tier.pvNfsServer.trim() || !tier.pvNfsPath.trim()) {
          errs.push(
            `Tier #${i + 1}: NFS server and path are required when PV type is NFS`
          );
        }
      }
    });

    return errs;
  };

  const handleGenerate = async () => {
    const v = validate();
    if (v.length) {
      setErrors(v);
      return;
    }
    setErrors([]);
    setLoading(true);
    setFiles(null);

    try {
      const payload = {
        appName,
        namespace,
        createNamespace,
        enableRBAC,
        tiers: tiers.map((t) => ({
          name: t.name,
          replicas: Number(t.replicas) || 1,
          image: t.image,
          containerPort: Number(t.containerPort) || 80,
          workloadType: t.workloadType || 'Deployment',
          env: (t.env || [])
            .filter((e) => e.name && e.value)
            .map((e) => ({ name: e.name, value: e.value })),
          configMapData: (t.configMapData || [])
            .filter((c) => c.key && c.value)
            .map((c) => ({ key: c.key, value: c.value })),
          secretData: (t.secretData || [])
            .filter((s) => s.key && s.value)
            .map((s) => ({ key: s.key, value: s.value })),
          pvc: {
            enabled: t.pvcEnabled,
            storageClass: t.pvcStorageClass || '',
            size: t.pvcSize || '',
            mountPath: t.pvcMountPath || '',
            accessMode: t.pvcAccessMode || 'ReadWriteOnce',
          },
          pv: {
            enabled: t.pvType && t.pvType !== 'none',
            type: t.pvType,
            storageClass: t.pvStorageClass || t.pvcStorageClass || '',
            size: t.pvSize || t.pvcSize || '',
            accessMode: t.pvAccessMode || t.pvcAccessMode || 'ReadWriteOnce',
            reclaimPolicy: t.pvReclaimPolicy || 'Retain',
            hostPath: t.pvHostPath || '',
            nfsServer: t.pvNfsServer || '',
            nfsPath: t.pvNfsPath || '',
          },
          service: {
            type: t.serviceType,
            port: Number(t.servicePort) || Number(t.containerPort) || 80,
            targetPort: Number(t.containerPort) || 80,
          },
          ingress:
            t.ingressHost && t.ingressPath
              ? {
                  host: t.ingressHost,
                  path: t.ingressPath || '/',
                }
              : null,
          // default probes & resources (can be made configurable later)
          livenessProbe: {
            path: '/healthz',
            port: Number(t.containerPort) || 80,
            initialDelaySeconds: 10,
            periodSeconds: 15,
          },
          readinessProbe: {
            path: '/readyz',
            port: Number(t.containerPort) || 80,
            initialDelaySeconds: 5,
            periodSeconds: 10,
          },
          resources: {
            requestsCpu: '100m',
            requestsMemory: '128Mi',
            limitsCpu: '500m',
            limitsMemory: '512Mi',
          },
        })),
      };

      const res = await axios.post('/api/generate/kubernetes', payload);
      if (res.data.success) {
        setFiles(res.data.files);
      } else {
        setErrors([res.data.error || 'Unknown backend error']);
      }
    } catch (err) {
      console.error(err);
      setErrors([
        err.response?.data?.error ||
          'Failed to contact backend. Is it running on port 5000?',
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (content) => {
    navigator.clipboard.writeText(content);
    alert('Copied to clipboard');
  };

  const combineFiles = (filesMap) => {
    if (!filesMap) return '';
    return Object.entries(filesMap)
      .map(([filename, content]) => `# --- ${filename} ---\n${content.trim()}`)
      .join('\n\n---\n\n');
  };

  const handleCopyAll = () => {
    const combined = combineFiles(files);
    handleCopy(combined);
  };

  const fetchSavedTemplates = async () => {
    try {
      const res = await axios.get('/api/templates');
      if (res.data.success) setSavedTemplates(res.data.templates || []);
    } catch (err) {
      console.warn('failed to fetch templates', err.message || err);
    }
  };

  useEffect(() => {
    fetchSavedTemplates();
  }, []);

  const handleSaveTemplate = async () => {
    if (!files) return alert('Generate manifests first');
    const name = window.prompt('Enter a name for this template');
    if (!name || !name.trim()) return;
    const content = combineFiles(files);
    try {
      const res = await axios.post('/api/templates', { name: name.trim(), content });
      if (res.data.success) {
        alert('Template saved');
        fetchSavedTemplates();
      } else {
        alert('Save failed: ' + (res.data.error || 'unknown'));
      }
    } catch (err) {
      console.error(err);
      alert('Save failed: ' + (err.response?.data?.error || err.message || 'error'));
    }
  };

  const handleSelectTemplate = async (id) => {
    try {
      const res = await axios.get(`/api/templates/${id}`);
      if (res.data.success && res.data.template) {
        setSelectedTemplate(res.data.template);
        setSelectedTemplateContent(res.data.template.content);
      }
    } catch (err) {
      console.warn('failed to load template', err.message || err);
    }
  };

  const handleDownloadAll = async () => {
    if (!files) return;
    const zip = new JSZip();
    Object.entries(files).forEach(([filename, content]) => {
      zip.file(filename, content);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${appName}-k8s-manifests.zip`);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
        gap: '1.25rem',
        alignItems: 'flex-start',
      }}
    >
      {/* LEFT: form */}
      <div>
        <div
          style={{
            marginBottom: '0.85rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 2 }}>
              Kubernetes Manifest Generator
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
              Multi-tier apps · Deployments / StatefulSets · PVC / PV · Ingress · RBAC
            </p>
          </div>
          <div>
            <label
              style={{
                fontSize: '0.75rem',
                color: '#9ca3af',
                display: 'block',
                marginBottom: 2,
              }}
            >
              Load preset
            </label>
            <select
              value={presetKey}
              onChange={(e) => {
                const key = e.target.value;
                setPresetKey(key);
                applyPreset(key);
              }}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.8rem',
                borderRadius: 999,
                border: '1px solid #1f2937',
                backgroundColor: '#020617',
                color: '#e5e7eb',
              }}
            >
              {K8S_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Global settings */}
        <section
          style={{
            borderRadius: '0.75rem',
            padding: '0.9rem',
            marginBottom: '0.9rem',
            backgroundColor: '#020617',
            border: '1px solid #1f2937',
          }}
        >
          <h3
            style={{
              fontSize: '0.9rem',
              fontWeight: 600,
              marginBottom: '0.4rem',
            }}
          >
            Global Settings
          </h3>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                App Name *
              </label>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                Namespace *
              </label>
              <input
                type="text"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={createNamespace}
                onChange={(e) => setCreateNamespace(e.target.checked)}
              />
              Generate Namespace manifest
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={enableRBAC}
                onChange={(e) => setEnableRBAC(e.target.checked)}
              />
              Generate RBAC (SA, Role, RoleBinding)
            </label>
          </div>
        </section>

        {/* Tiers */}
        {tiers.map((tier, index) => (
          <section
            key={index}
            style={{
              borderRadius: '0.75rem',
              padding: '0.9rem',
              marginBottom: '0.9rem',
              backgroundColor: '#020617',
              border: '1px solid #111827',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.6rem',
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                >
                  Tier #{index + 1}
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {tier.workloadType === 'StatefulSet'
                    ? 'Stateful workload with stable identity'
                    : 'Stateless app deployment'}
                </p>
              </div>
              {tiers.length > 1 && (
                <button
                  onClick={() => removeTier(index)}
                  className="action-btn-danger"
                >
                  Remove
                </button>

              )}
            </div>

            {/* Basic info + workload type */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                  Tier Name * (e.g. api, web, db)
                </label>
                <input
                  type="text"
                  value={tier.name}
                  onChange={(e) => updateTier(index, 'name', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                  }}
                />
              </div>
              <div style={{ width: 100 }}>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                  Replicas
                </label>
                <input
                  type="number"
                  min="1"
                  value={tier.replicas}
                  onChange={(e) => updateTier(index, 'replicas', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                  }}
                />
              </div>
              <div style={{ width: 150 }}>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                  Workload Type
                </label>
                <select
                  value={tier.workloadType}
                  onChange={(e) => updateTier(index, 'workloadType', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                  }}
                >
                  <option value="Deployment">Deployment</option>
                  <option value="StatefulSet">StatefulSet</option>
                </select>
              </div>
            </div>

            {/* Image + ports */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem' }}>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                  Image * (e.g. nginx:1.27)
                </label>
                <input
                  type="text"
                  value={tier.image}
                  onChange={(e) => updateTier(index, 'image', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                  }}
                />
              </div>
              <div style={{ width: 130 }}>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                  Container Port *
                </label>
                <input
                  type="number"
                  value={tier.containerPort}
                  onChange={(e) => updateTier(index, 'containerPort', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                  }}
                />
              </div>
            </div>

            {/* Service + Ingress */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem' }}>
              <div style={{ width: 150 }}>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                  Service Type
                </label>
                <select
                  value={tier.serviceType}
                  onChange={(e) => updateTier(index, 'serviceType', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                  }}
                >
                  <option value="ClusterIP">ClusterIP</option>
                  <option value="NodePort">NodePort</option>
                  <option value="LoadBalancer">LoadBalancer</option>
                </select>
              </div>
              <div style={{ width: 130 }}>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                  Service Port
                </label>
                <input
                  type="number"
                  value={tier.servicePort}
                  onChange={(e) => updateTier(index, 'servicePort', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                  Ingress Host (optional)
                </label>
                <input
                  type="text"
                  value={tier.ingressHost}
                  onChange={(e) => updateTier(index, 'ingressHost', e.target.value)}
                  placeholder="api.local"
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                  Ingress Path
                </label>
                <input
                  type="text"
                  value={tier.ingressPath}
                  onChange={(e) => updateTier(index, 'ingressPath', e.target.value)}
                  placeholder="/"
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                  }}
                />
              </div>
            </div>

            {/* ENV */}
            <div style={{ marginBottom: '0.6rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                  Environment Variables
                </span>
                <button
                  type="button"
                  onClick={() => addKeyValue(index, 'env')}
                  className="action-btn"
                >
                  + Add
                </button>
              </div>
              {(tier.env || []).length === 0 && (
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  No env vars. Click &quot;Add&quot; to define.
                </p>
              )}
              {(tier.env || []).map((row, rIndex) => (
                <div
                  key={rIndex}
                  style={{ display: 'flex', gap: '0.4rem', marginBottom: 4 }}
                >
                  <input
                    type="text"
                    placeholder="NAME"
                    value={row.name || ''}
                    onChange={(e) =>
                      updateKeyValue(index, 'env', rIndex, 'name', e.target.value)
                    }
                    style={{
                      flex: 1,
                      padding: '0.35rem',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="value"
                    value={row.value || ''}
                    onChange={(e) =>
                      updateKeyValue(index, 'env', rIndex, 'value', e.target.value)
                    }
                    style={{
                      flex: 1,
                      padding: '0.35rem',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeKeyValue(index, 'secretData', rIndex)}
                    className="action-btn-danger"
                  >
                    ✕
                  </button>

                </div>
              ))}
            </div>

            {/* ConfigMap */}
            <div style={{ marginBottom: '0.6rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                  ConfigMap Data
                </span>
                <button
                  type="button"
                  onClick={() => addKeyValue(index, 'configMapData')}
                  className="action-btn"
                >
                  + Add
                </button>

              </div>
              {(tier.configMapData || []).length === 0 && (
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  No ConfigMap entries.
                </p>
              )}
              {(tier.configMapData || []).map((row, rIndex) => (
                <div
                  key={rIndex}
                  style={{ display: 'flex', gap: '0.4rem', marginBottom: 4 }}
                >
                  <input
                    type="text"
                    placeholder="key"
                    value={row.key || ''}
                    onChange={(e) =>
                      updateKeyValue(index, 'configMapData', rIndex, 'key', e.target.value)
                    }
                    style={{
                      flex: 1,
                      padding: '0.35rem',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="value"
                    value={row.value || ''}
                    onChange={(e) =>
                      updateKeyValue(
                        index,
                        'configMapData',
                        rIndex,
                        'value',
                        e.target.value
                      )
                    }
                    style={{
                      flex: 1,
                      padding: '0.35rem',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeKeyValue(index, 'configMapData', rIndex)}
                    className="action-btn-danger"
                  >
                    ✕
                  </button>

                </div>
              ))}
            </div>

            {/* Secret */}
            <div style={{ marginBottom: '0.6rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Secret Data</span>
                <button
                  type="button"
                  onClick={() => addKeyValue(index, 'secretData')}
                  className="action-btn"
                >
                  + Add
                </button>

              </div>
              {(tier.secretData || []).length === 0 && (
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  No Secret entries. Values stored as stringData.
                </p>
              )}
              {(tier.secretData || []).map((row, rIndex) => (
                <div
                  key={rIndex}
                  style={{ display: 'flex', gap: '0.4rem', marginBottom: 4 }}
                >
                  <input
                    type="text"
                    placeholder="key"
                    value={row.key || ''}
                    onChange={(e) =>
                      updateKeyValue(index, 'secretData', rIndex, 'key', e.target.value)
                    }
                    style={{
                      flex: 1,
                      padding: '0.35rem',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="value"
                    value={row.value || ''}
                    onChange={(e) =>
                      updateKeyValue(index, 'secretData', rIndex, 'value', e.target.value)
                    }
                    style={{
                      flex: 1,
                      padding: '0.35rem',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeKeyValue(index, 'env', rIndex)}
                    className="action-btn-danger"
                  >
                    ✕
                  </button>

                </div>
              ))}
            </div>

            {/* PVC + PV */}
            <div
              style={{
                borderTop: '1px dashed #1f2937',
                marginTop: '0.6rem',
                paddingTop: '0.6rem',
                fontSize: '0.78rem',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <input
                  type="checkbox"
                  checked={tier.pvcEnabled}
                  onChange={(e) => updateTier(index, 'pvcEnabled', e.target.checked)}
                />
                Enable Persistent Volume Claim (PVC)
              </label>

              {tier.pvcEnabled && (
                <>
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div style={{ width: 170 }}>
                      <label
                        style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}
                      >
                        Storage Class (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="standard"
                        value={tier.pvcStorageClass}
                        onChange={(e) =>
                          updateTier(index, 'pvcStorageClass', e.target.value)
                        }
                        style={{
                          width: '100%',
                          padding: '0.35rem',
                        }}
                      />
                    </div>
                    <div style={{ width: 120 }}>
                      <label
                        style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}
                      >
                        PVC Size *
                      </label>
                      <input
                        type="text"
                        placeholder="5Gi"
                        value={tier.pvcSize}
                        onChange={(e) => updateTier(index, 'pvcSize', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.35rem',
                        }}
                      />
                    </div>
                    <div style={{ width: 170 }}>
                      <label
                        style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}
                      >
                        PVC Access Mode
                      </label>
                      <select
                        value={tier.pvcAccessMode}
                        onChange={(e) =>
                          updateTier(index, 'pvcAccessMode', e.target.value)
                        }
                        style={{
                          width: '100%',
                          padding: '0.35rem',
                        }}
                      >
                        <option value="ReadWriteOnce">ReadWriteOnce</option>
                        <option value="ReadOnlyMany">ReadOnlyMany</option>
                        <option value="ReadWriteMany">ReadWriteMany</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ width: '100%', marginBottom: '0.5rem' }}>
                    <label
                      style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}
                    >
                      Mount Path *
                    </label>
                    <input
                      type="text"
                      placeholder="/data"
                      value={tier.pvcMountPath}
                      onChange={(e) => updateTier(index, 'pvcMountPath', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.35rem',
                      }}
                    />
                  </div>

                  {/* PV section */}
                  <div
                    style={{
                      marginTop: '0.5rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px dashed #1f2937',
                    }}
                  >
                    <div style={{ marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                        Backing PersistentVolume (optional)
                      </span>
                      <p style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                        Choose a static PV backend or keep &quot;None&quot; to rely on
                        dynamic provisioning.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <div style={{ width: 180 }}>
                        <label
                          style={{
                            fontSize: '0.75rem',
                            display: 'block',
                            marginBottom: 4,
                          }}
                        >
                          PV Type
                        </label>
                        {/* <select
                          value={tier.pvType}
                          onChange={(e) => updateTier(index, 'pvType', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.35rem',
                          }}
                        >
                          <option value="none">None (no PV manifest)</option>
                          <option value="hostPath">HostPath (local)</option>
                          <option value="nfs">NFS</option>
                        </select> */}


                      <select
                        value={tier.pvType}
                        onChange={(e) => updateTier(index, 'pvType', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.35rem',
                        }}
                      >
                        <option value="none">None</option>
                        <option value="hostPath">HostPath</option>
                        <option value="nfs">NFS</option>
                        <option value="local">Local Storage</option>
                        <option value="awsEbs">AWS EBS Volume</option>
                        <option value="gcePd">GCE Persistent Disk</option>
                        <option value="azureDisk">Azure Disk</option>
                        <option value="cephRbd">Ceph RBD</option>
                        <option value="iscsi">iSCSI</option>
                      </select>


  
                      </div>
                      <div style={{ width: 120 }}>
                        <label
                          style={{
                            fontSize: '0.75rem',
                            display: 'block',
                            marginBottom: 4,
                          }}
                        >
                          PV Size
                        </label>
                        <input
                          type="text"
                          placeholder={tier.pvcSize || '5Gi'}
                          value={tier.pvSize}
                          onChange={(e) => updateTier(index, 'pvSize', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.35rem',
                          }}
                        />
                      </div>
                      <div style={{ width: 160 }}>
                        <label
                          style={{
                            fontSize: '0.75rem',
                            display: 'block',
                            marginBottom: 4,
                          }}
                        >
                          PV Access Mode
                        </label>
                        <select
                          value={tier.pvAccessMode}
                          onChange={(e) =>
                            updateTier(index, 'pvAccessMode', e.target.value)
                          }
                          style={{
                            width: '100%',
                            padding: '0.35rem',
                          }}
                        >
                          <option value="ReadWriteOnce">ReadWriteOnce</option>
                          <option value="ReadOnlyMany">ReadOnlyMany</option>
                          <option value="ReadWriteMany">ReadWriteMany</option>
                        </select>
                      </div>
                    </div>

                    {tier.pvType === 'hostPath' && (
                      <div style={{ marginBottom: '0.4rem' }}>
                        <label
                          style={{
                            fontSize: '0.75rem',
                            display: 'block',
                            marginBottom: 4,
                          }}
                        >
                          HostPath (local path on node)
                        </label>
                        <input
                          type="text"
                          placeholder={`/mnt/data/${appName}-${tier.name}`}
                          value={tier.pvHostPath}
                          onChange={(e) =>
                            updateTier(index, 'pvHostPath', e.target.value)
                          }
                          style={{ width: '100%', padding: '0.35rem' }}
                        />
                      </div>
                    )}

                    {tier.pvType === 'local' && (
                      <div style={{ marginBottom: '0.4rem' }}>
                        <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
                          Local Path
                        </label>
                        <input
                          type="text"
                          placeholder={`/mnt/local/${appName}-${tier.name}`}
                          value={tier.pvLocalPath}
                          onChange={(e) => updateTier(index, 'pvLocalPath', e.target.value)}
                          style={{ width: '100%', padding: '0.35rem' }}
                        />
                      </div>
                    )}

                    {tier.pvType === 'awsEbs' && (
                      <>
                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Volume ID</label>
                          <input
                            type="text"
                            placeholder="vol-123456"
                            value={tier.pvAwsVolumeID}
                            onChange={(e) => updateTier(index, 'pvAwsVolumeID', e.target.value)}
                          />
                        </div>
                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Filesystem</label>
                          <input
                            type="text"
                            placeholder="ext4"
                            value={tier.pvAwsFsType}
                            onChange={(e) => updateTier(index, 'pvAwsFsType', e.target.value)}
                          />
                        </div>
                      </>
                    )}

                    {tier.pvType === 'gcePd' && (
                      <>
                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>PD Name</label>
                          <input
                            type="text"
                            placeholder="disk-1"
                            value={tier.pvGcePdName}
                            onChange={(e) => updateTier(index, 'pvGcePdName', e.target.value)}
                          />
                        </div>
                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Filesystem</label>
                          <input
                            type="text"
                            placeholder="ext4"
                            value={tier.pvGceFsType}
                            onChange={(e) => updateTier(index, 'pvGceFsType', e.target.value)}
                          />
                        </div>
                      </>
                    )}

                    {tier.pvType === 'azureDisk' && (
                      <>
                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Disk Name</label>
                          <input
                            type="text"
                            value={tier.pvAzureDiskName}
                            placeholder="mydisk"
                            onChange={(e) => updateTier(index, 'pvAzureDiskName', e.target.value)}
                          />
                        </div>

                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Disk URI</label>
                          <input
                            type="text"
                            value={tier.pvAzureDiskURI}
                            placeholder="https://..."
                            onChange={(e) => updateTier(index, 'pvAzureDiskURI', e.target.value)}
                          />
                        </div>

                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Kind</label>
                          <select
                            value={tier.pvAzureKind}
                            onChange={(e) => updateTier(index, 'pvAzureKind', e.target.value)}
                          >
                            <option value="Managed">Managed</option>
                            <option value="Shared">Shared</option>
                          </select>
                        </div>

                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Caching Mode</label>
                          <select
                            value={tier.pvAzureCachingMode}
                            onChange={(e) => updateTier(index, 'pvAzureCachingMode', e.target.value)}
                          >
                            <option value="None">None</option>
                            <option value="ReadOnly">ReadOnly</option>
                            <option value="ReadWrite">ReadWrite</option>
                          </select>
                        </div>
                      </>
                    )}

                    {tier.pvType === 'cephRbd' && (
                      <>
                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Monitors (comma-separated)</label>
                          <input
                            type="text"
                            placeholder="10.0.0.1:6789,10.0.0.2:6789"
                            value={tier.pvCephMonitors}
                            onChange={(e) => updateTier(index, 'pvCephMonitors', e.target.value)}
                          />
                        </div>

                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Pool</label>
                          <input
                            type="text"
                            placeholder="rbd"
                            value={tier.pvCephPool}
                            onChange={(e) => updateTier(index, 'pvCephPool', e.target.value)}
                          />
                        </div>

                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Image</label>
                          <input
                            type="text"
                            value={tier.pvCephImage}
                            onChange={(e) => updateTier(index, 'pvCephImage', e.target.value)}
                          />
                        </div>

                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>User</label>
                          <input
                            type="text"
                            value={tier.pvCephUser}
                            onChange={(e) => updateTier(index, 'pvCephUser', e.target.value)}
                          />
                        </div>

                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Secret Name</label>
                          <input
                            type="text"
                            value={tier.pvCephSecretName}
                            onChange={(e) => updateTier(index, 'pvCephSecretName', e.target.value)}
                          />
                        </div>

                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Filesystem</label>
                          <input
                            type="text"
                            placeholder="ext4"
                            value={tier.pvCephFsType}
                            onChange={(e) => updateTier(index, 'pvCephFsType', e.target.value)}
                          />
                        </div>
                      </>
                    )}

                    {tier.pvType === 'iscsi' && (
                      <>
                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Target Portal</label>
                          <input
                            type="text"
                            placeholder="10.0.0.5:3260"
                            value={tier.pvIscsiTargetPortal}
                            onChange={(e) => updateTier(index, 'pvIscsiTargetPortal', e.target.value)}
                          />
                        </div>

                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>IQN</label>
                          <input
                            type="text"
                            placeholder="iqn.2001-04.com.example:storage"
                            value={tier.pvIscsiIqn}
                            onChange={(e) => updateTier(index, 'pvIscsiIqn', e.target.value)}
                          />
                        </div>

                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>LUN</label>
                          <input
                            type="number"
                            value={tier.pvIscsiLun}
                            onChange={(e) => updateTier(index, 'pvIscsiLun', e.target.value)}
                          />
                        </div>

                        <div style={{ marginBottom: '0.4rem' }}>
                          <label>Filesystem</label>
                          <input
                            type="text"
                            placeholder="ext4"
                            value={tier.pvIscsiFsType}
                            onChange={(e) => updateTier(index, 'pvIscsiFsType', e.target.value)}
                          />
                        </div>
                      </>
                    )}


                    {tier.pvType === 'nfs' && (
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <div style={{ flex: 1 }}>
                          <label
                            style={{
                              fontSize: '0.75rem',
                              display: 'block',
                              marginBottom: 4,
                            }}
                          >
                            NFS Server
                          </label>
                          <input
                            type="text"
                            placeholder="10.0.0.10"
                            value={tier.pvNfsServer}
                            onChange={(e) =>
                              updateTier(index, 'pvNfsServer', e.target.value)
                            }
                            style={{ width: '100%', padding: '0.35rem' }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label
                            style={{
                              fontSize: '0.75rem',
                              display: 'block',
                              marginBottom: 4,
                            }}
                          >
                            NFS Path
                          </label>
                          <input
                            type="text"
                            placeholder="/export/data"
                            value={tier.pvNfsPath}
                            onChange={(e) =>
                              updateTier(index, 'pvNfsPath', e.target.value)
                            }
                            style={{ width: '100%', padding: '0.35rem' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <p style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4 }}>
                    • Deployment: standalone PVC manifest + optional PV manifest.
                    <br />
                    • StatefulSet: volumeClaimTemplate uses same size, class, access mode.
                  </p>
                </>
              )}
            </div>
          </section>
        ))}

        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <button
            onClick={addTier}
            type="button"
            className="action-btn"
          >
            + Add Tier
          </button>


          <button
            onClick={handleGenerate}
            type="button"
            disabled={loading}
            className="action-btn-primary"
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Generating…' : 'Generate Manifests'}
          </button>

        </div>

        {errors.length > 0 && (
          <div
            style={{
              marginTop: '0.4rem',
              padding: '0.6rem',
              borderRadius: '0.6rem',
              border: '1px solid #7f1d1d',
              background: '#111827',
              fontSize: '0.8rem',
              color: '#fecaca',
            }}
          >
            <strong style={{ display: 'block', marginBottom: 4 }}>Errors:</strong>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Saved templates section */}
      <div style={{ marginTop: '1rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Saved Templates</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="action-btn" onClick={fetchSavedTemplates}>
              Refresh
            </button>
          </div>
        </div>

        {savedTemplates.length === 0 && (
          <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            No saved templates yet. Save a generated manifest to create one.
          </p>
        )}

        {savedTemplates.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.45rem',
              border: '1px solid #111827',
              borderRadius: 8,
              marginBottom: 6,
              background: selectedTemplate?.id === t.id ? '#071133' : 'transparent',
              cursor: 'pointer',
            }}
            onClick={() => handleSelectTemplate(t.id)}
          >
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{t.name}</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {new Date(t.created_at).toLocaleString()}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectTemplate(t.id);
                }}
              >
                View
              </button>
            </div>
          </div>
        ))}

        {selectedTemplateContent && (
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <strong>{selectedTemplate?.name}</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="action-btn"
                  onClick={() => handleCopy(selectedTemplateContent)}
                >
                  Copy
                </button>
              </div>
            </div>
            <div style={{ border: '1px solid #111827', borderRadius: 8, overflow: 'hidden' }}>
              <SyntaxHighlighter language="yaml">{selectedTemplateContent}</SyntaxHighlighter>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: output */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '0.6rem',
            alignItems: 'center',
          }}
        >
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Generated Manifests</h2>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {files && (
              <>
                <button
                  type="button"
                  onClick={handleCopyAll}
                  className="action-btn"
                  style={{ fontSize: '0.7rem' }}
                >
                  Copy All
                </button>
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  className="action-btn"
                  style={{ fontSize: '0.7rem' }}
                >
                  Save Template
                </button>
              </>
            )}

          </div>
        </div>

        {!files && (
          <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            Choose a preset or fill the form, then click{' '}
            <strong>Generate Manifests</strong> to see YAML here.
          </p>
        )}

        {files &&
          Object.entries(files).map(([filename, content]) => (
            <div
              key={filename}
              style={{
                borderRadius: '0.75rem',
                marginBottom: '0.7rem',
                overflow: 'hidden',
                border: '1px solid #111827',
                backgroundColor: '#020617',
              }}
            >
              <div
                style={{
                  padding: '0.35rem 0.7rem',
                  borderBottom: '1px solid #111827',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.8rem',
                }}
              >
                <span>{filename}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(content)}
                  style={{
                    fontSize: '0.7rem',
                    borderRadius: 999,
                    border: '1px solid #1f2937',
                    padding: '0.15rem 0.5rem',
                    background: '#020617',
                    cursor: 'pointer',
                  }}
                >
                  Copy
                </button>
              </div>
              <SyntaxHighlighter language="yaml" customStyle={{ margin: 0 }}>
                {content}
              </SyntaxHighlighter>
            </div>
          ))}
      </div>
    </div>
  );
}

export default KubernetesGenerator;

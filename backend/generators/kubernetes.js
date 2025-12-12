
// backend/generators/kubernetes.js

function renderEnv(env = []) {
  if (!env.length) return '';
  return `
          env:
${env
  .map(
    (e) => `            - name: ${e.name}
              value: "${e.value}"`
  )
  .join('\n')}`;
}

function renderResources(resources = {}) {
  const { requestsCpu, requestsMemory, limitsCpu, limitsMemory } = resources;
  if (!requestsCpu && !requestsMemory && !limitsCpu && !limitsMemory) return '';

  const lines = [];
  if (requestsCpu || requestsMemory) {
    lines.push('requests:');
    if (requestsCpu) lines.push(`  cpu: "${requestsCpu}"`);
    if (requestsMemory) lines.push(`  memory: "${requestsMemory}"`);
  }
  if (limitsCpu || limitsMemory) {
    lines.push('limits:');
    if (limitsCpu) lines.push(`  cpu: "${limitsCpu}"`);
    if (limitsMemory) lines.push(`  memory: "${limitsMemory}"`);
  }

  if (!lines.length) return '';

  return `
          resources:
${lines
  .map((l, i) =>
    i === 0 ? `            ${l}` : `            ${l.startsWith('  ') ? l : '  ' + l}`
  )
  .join('\n')}`;
}

function renderHttpProbe(probe, type) {
  if (!probe || !probe.path || !probe.port) return '';
  const {
    path,
    port,
    initialDelaySeconds = 10,
    periodSeconds = 10,
  } = probe;

  return `
          ${type}Probe:
            httpGet:
              path: ${path}
              port: ${port}
            initialDelaySeconds: ${initialDelaySeconds}
            periodSeconds: ${periodSeconds}`;
}

function renderConfigMap(tier, namespace, appName) {
  const { configMapData = [], name } = tier;
  if (!configMapData.length) return null;

  const dataLines = configMapData
    .map((d) => `  ${d.key}: "${d.value}"`)
    .join('\n');

  const cmName = `${appName}-${name}-config`;

  return {
    filename: `configmap-${name}.yaml`,
    content: `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${cmName}
  namespace: ${namespace}
data:
${dataLines}
`,
    cmName,
  };
}

function renderSecret(tier, namespace, appName) {
  const { secretData = [], name } = tier;
  if (!secretData.length) return null;

  const dataLines = secretData
    .map((d) => `  ${d.key}: "${d.value}"`)
    .join('\n');

  const secretName = `${appName}-${name}-secret`;

  return {
    filename: `secret-${name}.yaml`,
    content: `apiVersion: v1
kind: Secret
metadata:
  name: ${secretName}
  namespace: ${namespace}
type: Opaque
stringData:
${dataLines}
`,
    secretName,
  };
}

function generateNamespace(namespace) {
  return `apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
`;
}

// PVC for Deployment
function generatePVC(tier, namespace, appName) {
  const pvc = tier.pvc || {};
  if (!pvc.enabled) return null;

  const {
    storageClass = '',
    size = '5Gi',
    accessMode = 'ReadWriteOnce',
  } = pvc;

  const pvcName = `${appName}-${tier.name}-pvc`;

  const scLine = storageClass ? `  storageClassName: "${storageClass}"\n` : '';

  return {
    filename: `pvc-${tier.name}.yaml`,
    content: `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${pvcName}
  namespace: ${namespace}
spec:
  accessModes:
    - ${accessMode}
${scLine}  resources:
    requests:
      storage: ${size}
`,
    pvcName,
  };
}

// PV (cluster scoped) – user selectable backend
// function generatePV(tier, appName) {
//   const pv = tier.pv || {};
//   const {
//     enabled,
//     type,
//     size = '5Gi',
//     accessMode = 'ReadWriteOnce',
//     reclaimPolicy = 'Retain',
//     storageClass = '',
//     hostPath,
//     nfsServer,
//     nfsPath,
//   } = pv;

//   if (!enabled || !type || type === 'none') return null;

//   const pvName = `${appName}-${tier.name}-pv`;
//   const scLine = storageClass ? `  storageClassName: "${storageClass}"\n` : '';

//   let volumeSource = '';

//   if (type === 'hostPath') {
//     const path = hostPath || `/mnt/data/${appName}-${tier.name}`;
//     volumeSource = `  hostPath:
//     path: ${path}
// `;
//   } else if (type === 'nfs') {
//     if (!nfsServer || !nfsPath) {
//       // invalid NFS config -> don't generate PV
//       return null;
//     }
//     volumeSource = `  nfs:
//     server: ${nfsServer}
//     path: ${nfsPath}
//     readOnly: false
// `;
//   } else {
//     // unsupported type for now
//     return null;
//   }

//   return {
//     filename: `pv-${tier.name}.yaml`,
//     content: `apiVersion: v1
// kind: PersistentVolume
// metadata:
//   name: ${pvName}
// spec:
//   capacity:
//     storage: ${size}
//   accessModes:
//     - ${accessMode}
//   persistentVolumeReclaimPolicy: ${reclaimPolicy}
// ${scLine}${volumeSource}`,
//   };
// }

function generatePV(tier, appName) {
  const pv = tier.pv || {};
  const {
    enabled,
    type,
    size = '5Gi',
    accessMode = 'ReadWriteOnce',
    reclaimPolicy = 'Retain',
    storageClass = '',
    hostPath,
    nfsServer,
    nfsPath,
    localPath,
    awsVolumeID,
    awsFsType,
    gcePdName,
    gceFsType,
    azureDiskName,
    azureDiskURI,
    azureKind,
    azureCachingMode,
    cephMonitors,
    cephPool,
    cephImage,
    cephUser,
    cephSecretName,
    cephFsType,
    iscsiTargetPortal,
    iscsiIqn,
    iscsiLun,
    iscsiFsType,
  } = pv;

  if (!enabled || !type || type === 'none') return null;

  const pvName = `${appName}-${tier.name}-pv`;
  const scLine = storageClass ? `  storageClassName: "${storageClass}"\n` : '';

  let volumeSource = '';

  switch (type) {
    case 'hostPath': {
      const path = hostPath || `/mnt/data/${appName}-${tier.name}`;
      volumeSource = `  hostPath:
    path: ${path}
`;
      break;
    }

    case 'nfs': {
      if (!nfsServer || !nfsPath) return null;
      volumeSource = `  nfs:
    server: ${nfsServer}
    path: ${nfsPath}
    readOnly: false
`;
      break;
    }

    case 'local': {
      const path = localPath || `/mnt/local/${appName}-${tier.name}`;
      volumeSource = `  local:
    path: ${path}
`;
      break;
    }

    case 'awsEbs': {
      if (!awsVolumeID) return null;
      volumeSource = `  awsElasticBlockStore:
    volumeID: ${awsVolumeID}
    fsType: ${awsFsType || 'ext4'}
`;
      break;
    }

    case 'gcePd': {
      if (!gcePdName) return null;
      volumeSource = `  gcePersistentDisk:
    pdName: ${gcePdName}
    fsType: ${gceFsType || 'ext4'}
`;
      break;
    }

    case 'azureDisk': {
      if (!azureDiskName || !azureDiskURI) return null;
      volumeSource = `  azureDisk:
    diskName: ${azureDiskName}
    diskURI: ${azureDiskURI}
    kind: ${azureKind || 'Managed'}
    cachingMode: ${azureCachingMode || 'None'}
`;
      break;
    }

    case 'cephRbd': {
      if (!cephMonitors || !cephPool || !cephImage || !cephUser) return null;
      volumeSource = `  rbd:
    monitors: [${cephMonitors}]
    pool: ${cephPool}
    image: ${cephImage}
    user: ${cephUser}
    secretRef:
      name: ${cephSecretName || `${appName}-ceph-secret`}
    fsType: ${cephFsType || 'ext4'}
`;
      break;
    }

    case 'iscsi': {
      if (!iscsiTargetPortal || !iscsiIqn || !iscsiLun) return null;
      volumeSource = `  iscsi:
    targetPortal: ${iscsiTargetPortal}
    iqn: ${iscsiIqn}
    lun: ${iscsiLun}
    fsType: ${iscsiFsType || 'ext4'}
`;
      break;
    }

    default:
      return null;
  }

  return {
    filename: `pv-${tier.name}.yaml`,
    content: `apiVersion: v1
kind: PersistentVolume
metadata:
  name: ${pvName}
spec:
  capacity:
    storage: ${size}
  accessModes:
    - ${accessMode}
  persistentVolumeReclaimPolicy: ${reclaimPolicy}
${scLine}${volumeSource}`,
  };
}


function generateDeployment(tier, namespace, appName, cmRef, secretRef, pvcRef) {
  const {
    name,
    replicas,
    image,
    containerPort,
    env,
    resources,
    livenessProbe,
    readinessProbe,
  } = tier;

  const deploymentName = `${appName}-${name}`;

  const envSection = renderEnv(env);
  const resourcesSection = renderResources(resources);
  const livenessSection = renderHttpProbe(livenessProbe, 'liveness');
  const readinessSection = renderHttpProbe(readinessProbe, 'readiness');

  const volumeMounts = [];
  const volumes = [];

  if (cmRef) {
    volumeMounts.push(`            - name: ${cmRef.cmName}-vol
              mountPath: /config/${name}`);
    volumes.push(`        - name: ${cmRef.cmName}-vol
          configMap:
            name: ${cmRef.cmName}`);
  }

  if (secretRef) {
    volumeMounts.push(`            - name: ${secretRef.secretName}-vol
              mountPath: /secrets/${name}`);
    volumes.push(`        - name: ${secretRef.secretName}-vol
          secret:
            secretName: ${secretRef.secretName}`);
  }

  if (pvcRef) {
    const mountPath = tier?.pvc?.mountPath || '/data';
    volumeMounts.push(`            - name: ${pvcRef.pvcName}-vol
              mountPath: ${mountPath}`);
    volumes.push(`        - name: ${pvcRef.pvcName}-vol
          persistentVolumeClaim:
            claimName: ${pvcRef.pvcName}`);
  }

  const volumeMountsSection = volumeMounts.length
    ? `
          volumeMounts:
${volumeMounts.join('\n')}`
    : '';

  const volumesSection = volumes.length
    ? `
      volumes:
${volumes.join('\n')}`
    : '';

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deploymentName}
  namespace: ${namespace}
  labels:
    app: ${appName}
    tier: ${name}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${appName}
      tier: ${name}
  template:
    metadata:
      labels:
        app: ${appName}
        tier: ${name}
    spec:
      containers:
        - name: ${name}
          image: ${image}
          ports:
            - containerPort: ${containerPort}${envSection}${resourcesSection}${livenessSection}${readinessSection}${volumeMountsSection}${volumesSection}
`;
}

function generateStatefulSet(tier, namespace, appName, cmRef, secretRef) {
  const {
    name,
    replicas,
    image,
    containerPort,
    env,
    resources,
    livenessProbe,
    readinessProbe,
    pvc,
  } = tier;

  const ssName = `${appName}-${name}`;
  const headlessServiceName = `${appName}-${name}-headless`;

  const envSection = renderEnv(env);
  const resourcesSection = renderResources(resources);
  const livenessSection = renderHttpProbe(livenessProbe, 'liveness');
  const readinessSection = renderHttpProbe(readinessProbe, 'readiness');

  const volumeMounts = [];
  const volumeClaimTemplates = [];

  if (cmRef) {
    volumeMounts.push(`            - name: ${cmRef.cmName}-vol
              mountPath: /config/${name}`);
  }

  if (secretRef) {
    volumeMounts.push(`            - name: ${secretRef.secretName}-vol
              mountPath: /secrets/${name}`);
  }

  if (pvc && pvc.enabled) {
    const {
      size = '5Gi',
      storageClass = '',
      accessMode = 'ReadWriteOnce',
      mountPath = '/data',
    } = pvc;

    volumeMounts.push(`            - name: data
              mountPath: ${mountPath}`);

    const scLine = storageClass ? `        storageClassName: "${storageClass}"\n` : '';

    volumeClaimTemplates.push(`  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes:
          - ${accessMode}
${scLine}        resources:
          requests:
            storage: ${size}`);
  }

  const volumeMountsSection = volumeMounts.length
    ? `
          volumeMounts:
${volumeMounts.join('\n')}`
    : '';

  const vctSection = volumeClaimTemplates.length
    ? `
${volumeClaimTemplates.join('\n')}`
    : '';

  let extraVolumes = '';
  if (cmRef || secretRef) {
    extraVolumes = `
      volumes:${cmRef ? `
        - name: ${cmRef.cmName}-vol
          configMap:
            name: ${cmRef.cmName}` : ''}${secretRef ? `
        - name: ${secretRef.secretName}-vol
          secret:
            secretName: ${secretRef.secretName}` : ''}`;
  }

  return `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${ssName}
  namespace: ${namespace}
  labels:
    app: ${appName}
    tier: ${name}
spec:
  serviceName: ${headlessServiceName}
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${appName}
      tier: ${name}
  template:
    metadata:
      labels:
        app: ${appName}
        tier: ${name}
    spec:
      containers:
        - name: ${name}
          image: ${image}
          ports:
            - containerPort: ${containerPort}${envSection}${resourcesSection}${livenessSection}${readinessSection}${volumeMountsSection}${extraVolumes}${vctSection}
`;
}

function generateService(tier, namespace, appName) {
  const { name, containerPort, service } = tier;
  if (!service) return null;

  const serviceName = `${appName}-${name}`;
  const { type, port, targetPort } = service;

  return `apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}
  namespace: ${namespace}
  labels:
    app: ${appName}
    tier: ${name}
spec:
  type: ${type}
  selector:
    app: ${appName}
    tier: ${name}
  ports:
    - name: http
      port: ${port}
      targetPort: ${targetPort || containerPort}
`;
}

function generateHeadlessService(tier, namespace, appName) {
  const { name } = tier;
  const serviceName = `${appName}-${name}-headless`;

  return `apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}
  namespace: ${namespace}
  labels:
    app: ${appName}
    tier: ${name}
spec:
  clusterIP: None
  selector:
    app: ${appName}
    tier: ${name}
  ports:
    - name: http
      port: ${tier.containerPort || 80}
      targetPort: ${tier.containerPort || 80}
`;
}

function generateIngress(tiers, namespace, appName) {
  const rulesByHost = {};

  tiers.forEach((tier) => {
    if (!tier.ingress || !tier.service) return;
    const { host, path } = tier.ingress;
    const serviceName = `${appName}-${tier.name}`;
    const servicePort = tier.service.port;

    if (!rulesByHost[host]) {
      rulesByHost[host] = [];
    }
    rulesByHost[host].push({ path, serviceName, servicePort });
  });

  const hosts = Object.keys(rulesByHost);
  if (!hosts.length) return null;

  const rulesYaml = hosts
    .map((host) => {
      const pathsYaml = rulesByHost[host]
        .map(
          (r) => `        - path: ${r.path}
          pathType: Prefix
          backend:
            service:
              name: ${r.serviceName}
              port:
                number: ${r.servicePort}`
        )
        .join('\n');

      return `  - host: ${host}
    http:
      paths:
${pathsYaml}`;
    })
    .join('\n');

  return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${appName}-ingress
  namespace: ${namespace}
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
${rulesYaml}
`;
}

function generateRBAC(namespace, appName) {
  const saName = `${appName}-sa`;
  const roleName = `${appName}-role`;
  const rbName = `${appName}-rb`;

  const serviceAccount = `apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${saName}
  namespace: ${namespace}
`;

  const role = `apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${roleName}
  namespace: ${namespace}
rules:
  - apiGroups: [""]
    resources: ["pods", "services", "configmaps", "secrets"]
    verbs: ["get", "list", "watch", "create", "update", "delete"]
`;

  const roleBinding = `apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${rbName}
  namespace: ${namespace}
subjects:
  - kind: ServiceAccount
    name: ${saName}
    namespace: ${namespace}
roleRef:
  kind: Role
  name: ${roleName}
  apiGroup: rbac.authorization.k8s.io
`;

  return {
    'serviceaccount.yaml': serviceAccount,
    'role.yaml': role,
    'rolebinding.yaml': roleBinding,
  };
}

function generateKubernetesManifests(payload) {
  const errors = [];

  if (!payload.appName) errors.push('appName is required');
  if (!payload.namespace) errors.push('namespace is required');
  if (!Array.isArray(payload.tiers) || !payload.tiers.length) {
    errors.push('At least one tier is required');
  }

  if (errors.length) {
    const error = new Error('Validation failed');
    error.statusCode = 400;
    error.details = errors;
    throw error;
  }

  const { appName, namespace, createNamespace, enableRBAC, tiers } = payload;

  /** @type {Record<string,string>} */
  const files = {};

  if (createNamespace) {
    files['namespace.yaml'] = generateNamespace(namespace);
  }

  const cmRefs = {};
  const secretRefs = {};
  const pvcRefs = {};

  // First pass: ConfigMaps, Secrets, PVCs, PVs
  tiers.forEach((tier) => {
    const cm = renderConfigMap(tier, namespace, appName);
    if (cm) {
      files[cm.filename] = cm.content;
      cmRefs[tier.name] = cm;
    }

    const secret = renderSecret(tier, namespace, appName);
    if (secret) {
      files[secret.filename] = secret.content;
      secretRefs[tier.name] = secret;
    }

    if (tier.pvc && tier.pvc.enabled && (tier.workloadType === 'Deployment' || !tier.workloadType)) {
      const pvc = generatePVC(tier, namespace, appName);
      if (pvc) {
        files[pvc.filename] = pvc.content;
        pvcRefs[tier.name] = pvc;
      }
    }

    // PV (for both Deployment and StatefulSet if enabled)
    if (tier.pv && tier.pv.enabled && tier.pv.type && tier.pv.type !== 'none') {
      const pv = generatePV(tier, appName);
      if (pv) {
        files[pv.filename] = pv.content;
      }
    }
  });

  // Workloads & Services
  tiers.forEach((tier) => {
    const workloadType = tier.workloadType || 'Deployment';
    const cmRef = cmRefs[tier.name];
    const secretRef = secretRefs[tier.name];
    const pvcRef = pvcRefs[tier.name];

    if (workloadType === 'StatefulSet') {
      const headlessSvc = generateHeadlessService(tier, namespace, appName);
      files[`headless-service-${tier.name}.yaml`] = headlessSvc;

      const ss = generateStatefulSet(tier, namespace, appName, cmRef, secretRef);
      files[`statefulset-${tier.name}.yaml`] = ss;
    } else {
      const deployment = generateDeployment(
        tier,
        namespace,
        appName,
        cmRef,
        secretRef,
        pvcRef
      );
      files[`deployment-${tier.name}.yaml`] = deployment;
    }

    const svcContent = generateService(tier, namespace, appName);
    if (svcContent) {
      files[`service-${tier.name}.yaml`] = svcContent;
    }
  });

  const ingress = generateIngress(tiers, namespace, appName);
  if (ingress) {
    files['ingress.yaml'] = ingress;
  }

  if (enableRBAC) {
    Object.assign(files, generateRBAC(namespace, appName));
  }

  return files;
}

module.exports = {
  generateKubernetesManifests,
};


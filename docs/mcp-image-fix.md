# MCP Image Registry Fix Documentation

## Problem Solved
Developers were encountering `ImagePullBackOff` errors when Kubernetes tried to deploy MCP containers because the Docker images weren't available in the local registry (`localhost:5001`).

## Solution Implemented
Added automatic image registry management to the build process. Now when developers run `pnpm run build`, the system automatically:

1. **Checks if Docker is available**
2. **Ensures local registry is running** (port 5001)
3. **Finds or builds the MCP HTTP Bridge image**
4. **Tags it for the local registry**
5. **Pushes it to the registry**
6. **Restarts any failing pods**

## Files Added/Modified

### New: `scripts/ensure-mcp-image.js`
- Handles all MCP image registry operations
- Can be run standalone: `node scripts/ensure-mcp-image.js`
- Automatically finds Docker even if not in PATH
- Creates placeholder image if source not found

### Modified: `scripts/check-k8s-requirements.js`
- Now calls `ensureMCPImage()` during prebuild
- Ensures image is ready before build completes

## How It Works

### Automatic (Recommended)
```bash
# Just run build as normal - image handling is automatic!
pnpm run build
```

### Manual (If Needed)
```bash
# Run the image ensure script directly
node scripts/ensure-mcp-image.js

# Or manually push an image
docker tag starships/mcp-http-bridge:latest localhost:5001/starships/mcp-http-bridge:latest
docker push localhost:5001/starships/mcp-http-bridge:latest
```

## Troubleshooting

### Issue: "Docker not found"
**Solution:** Ensure Docker Desktop is installed and running. The script checks:
- Standard PATH locations
- `/Applications/Docker.app/Contents/Resources/bin/docker`
- `/opt/homebrew/bin/docker`

### Issue: "Registry not running"
**Solution:** The script automatically starts the registry container. If it fails:
```bash
docker run -d --name starships-registry -p 5001:5000 --restart=always registry:2
```

### Issue: "Image push failed"
**Solution:** Check registry is accessible:
```bash
curl http://localhost:5001/v2/_catalog
```

### Issue: Pod still failing after fix
**Solution:** Force a deployment restart:
```bash
kubectl rollout restart deployment/mcp-notionapi-deployment -n <namespace>
```

## What This Prevents

Before this fix, developers would encounter:
```
Warning  Failed     kubelet  Failed to pull image "localhost:5001/starships/mcp-http-bridge:latest": 
  rpc error: code = NotFound desc = failed to pull and unpack image
Error: ErrImagePull
Error: ImagePullBackOff
```

Now the image is automatically available in the registry before Kubernetes needs it!

## For CI/CD

In production environments, replace the local registry with your cloud registry:

```javascript
// In ensure-mcp-image.js, modify:
const registryImage = process.env.REGISTRY_URL 
  ? `${process.env.REGISTRY_URL}/${imageName}`
  : `localhost:5001/${imageName}`;
```

## Notes

- The script is idempotent - safe to run multiple times
- Adds ~5-10 seconds to first build (subsequent builds are faster)
- Image is only pushed if not already in registry
- Works with both `npm run build` and `pnpm run build`

## Team Benefits

✅ **No manual Docker commands needed**
✅ **Prevents common deployment failures**
✅ **Works automatically for all developers**
✅ **Self-healing (restarts failed pods)**
✅ **Clear error messages if issues occur**

---

*Last Updated: 2024-08-15*
*Author: Development Team*
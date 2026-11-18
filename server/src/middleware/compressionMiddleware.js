import zlib from 'node:zlib';
import { Writable, pipeline } from 'node:stream';

const DEFAULT_THRESHOLD_BYTES = 1024;

const acceptsGzip = (header = '') => {
  if (!header || typeof header !== 'string') return false;
  let supportsGzip = false;
  let gzipDisabled = false;

  for (const part of header.split(',')) {
    const [encodingRaw, ...params] = part.trim().toLowerCase().split(';');
    if (encodingRaw !== 'gzip' && encodingRaw !== '*') continue;
    const qParam = params.find((p) => p.trim().startsWith('q='));
    const q = qParam ? Number.parseFloat(qParam.split('=')[1]) : 1;
    if (encodingRaw === 'gzip') {
      if (Number.isNaN(q) || q <= 0) gzipDisabled = true;
      else supportsGzip = true;
    } else if (!Number.isNaN(q) && q > 0) {
      supportsGzip = true;
    }
  }
  return supportsGzip && !gzipDisabled;
};

const isCompressibleContentType = (contentType = '') => {
  const mime = String(contentType).toLowerCase().split(';')[0].trim();
  if (!mime) return false;
  if (mime.startsWith('text/')) return true;
  if (mime === 'application/json' || mime.endsWith('+json')) return true;
  if (mime === 'application/javascript' || mime === 'application/xml' || mime.endsWith('+xml')) {
    return true;
  }
  return false;
};

const shouldCompressResponse = (req, res) => {
  if (res.statusCode < 200 || res.statusCode === 204 || res.statusCode === 304) return false;
  if (res.getHeader('content-encoding')) return false;
  if (req.headers.range || res.getHeader('content-range')) return false;
  // Preserve byte-accurate ranges/streams used by res.download() & res.sendFile()
  if (res.getHeader('accept-ranges')) return false;

  const cacheControl = String(res.getHeader('cache-control') || '');
  if (/\bno-transform\b/i.test(cacheControl)) return false;

  return isCompressibleContentType(res.getHeader('content-type'));
};

const applyVaryIfCompressible = (res) => {
  if (res.headersSent) return;
  if (res.statusCode < 200 || res.statusCode === 204 || res.statusCode === 304) return;
  if (isCompressibleContentType(res.getHeader('content-type'))) {
    res.vary('Accept-Encoding');
  }
};

const parseEndOrWriteArgs = (chunk, encoding, cb) => {
  if (typeof chunk === 'function') {
    return { chunk: null, encoding: undefined, cb: chunk };
  }
  if (typeof encoding === 'function') {
    return { chunk, encoding: undefined, cb: encoding };
  }
  return { chunk, encoding, cb };
};

const invokeOriginal = (fn, chunk, encoding, cb) => {
  if (chunk != null && encoding != null && cb) return fn(chunk, encoding, cb);
  if (chunk != null && encoding != null) return fn(chunk, encoding);
  if (chunk != null && cb) return fn(chunk, cb);
  if (chunk != null) return fn(chunk);
  if (cb) return fn(cb);
  return fn();
};

/**
 * Built-in zlib gzip compression middleware for compressible API JSON/text/CSV payloads and streams.
 * Coordinates transform writable & downstream socket backpressure cleanly via pipeline(), preserves
 * Vary: Accept-Encoding even on gzip;q=0, and skips PDFs, static downloads, HEAD/204/304, and <threshold payloads.
 */
export const createCompressionMiddleware = ({ threshold = DEFAULT_THRESHOLD_BYTES } = {}) => {
  return (req, res, next) => {
    if (req.method === 'HEAD' || req.headers['x-no-compression']) {
      return next();
    }

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const originalEmit = res.emit.bind(res);
    const originalWriteHead = res.writeHead.bind(res);

    // Ensure Vary: Accept-Encoding is still sent on compressible responses even when client disables gzip (e.g. gzip;q=0)
    if (!acceptsGzip(req.headers['accept-encoding'])) {
      let checkedVary = false;
      const markVaryOnce = (writeHeadArgs = null) => {
        if (checkedVary) return;
        checkedVary = true;
        if (writeHeadArgs) {
          for (const arg of writeHeadArgs) {
            if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
              const ctKey = Object.keys(arg).find((k) => k.toLowerCase() === 'content-type');
              if (ctKey && isCompressibleContentType(arg[ctKey]) && !res.headersSent) {
                res.vary('Accept-Encoding');
                return;
              }
            }
          }
        }
        applyVaryIfCompressible(res);
      };

      res.writeHead = function varyOnlyWriteHead(...args) {
        markVaryOnce(args);
        return originalWriteHead(...args);
      };
      res.write = function varyOnlyWrite(chunk, encoding, cb) {
        markVaryOnce();
        return originalWrite(chunk, encoding, cb);
      };
      res.end = function varyOnlyEnd(chunk, encoding, cb) {
        markVaryOnce();
        return originalEnd(chunk, encoding, cb);
      };
      return next();
    }

    let hasStartedWrite = false;
    let bypassStreaming = false;
    let streamClosed = false;
    let gzipStream = null;
    let downstreamSink = null;
    let gzipWriteFull = false;
    let socketFull = false;
    let upstreamNeedsDrain = false;
    let socketDrainResolve = null;
    let pendingEndCallback = null;

    const releaseSocketDrain = () => {
      socketFull = false;
      if (socketDrainResolve) {
        const resume = socketDrainResolve;
        socketDrainResolve = null;
        resume();
      }
    };

    const restoreResponseMethods = () => {
      if (res.emit !== originalEmit) res.emit = originalEmit;
    };

    const cleanupStreams = () => {
      streamClosed = true;
      gzipWriteFull = false;
      upstreamNeedsDrain = false;
      releaseSocketDrain();
      restoreResponseMethods();
      if (gzipStream && !gzipStream.destroyed) gzipStream.destroy();
      if (downstreamSink && !downstreamSink.destroyed) downstreamSink.destroy();
    };

    const initCompressionPipeline = () => {
      res.removeHeader('content-length');
      res.setHeader('Content-Encoding', 'gzip');
      res.vary('Accept-Encoding');

      gzipStream = zlib.createGzip();
      downstreamSink = new Writable({
        write(compressedChunk, _encoding, cb) {
          if (streamClosed || res.destroyed) return cb();
          let ok;
          try {
            ok = originalWrite(compressedChunk);
          } catch (writeErr) {
            return cb(writeErr);
          }
          if (ok) {
            return cb();
          }
          socketFull = true;
          socketDrainResolve = cb;
        },
        final(cb) {
          if (streamClosed || res.destroyed) return cb();
          invokeOriginal(originalEnd, null, undefined, cb);
        },
      });

      // Intercept socket drain so upstream resumes ONLY when both downstream socket AND gzip writable are ready
      res.emit = function coordinatedEmit(eventName, ...args) {
        if (eventName !== 'drain' || bypassStreaming || !gzipStream) {
          return originalEmit(eventName, ...args);
        }
        releaseSocketDrain();
        // Re-check !socketFull after releaseSocketDrain() in case downstreamSink synchronously refilled socket
        if (!socketFull && !gzipWriteFull && upstreamNeedsDrain && !streamClosed) {
          upstreamNeedsDrain = false;
          return originalEmit('drain', ...args);
        }
        return false;
      };

      // Propagate real gzip transform writable drain once downstream socket is clear
      gzipStream.on('drain', () => {
        gzipWriteFull = false;
        if (!socketFull && upstreamNeedsDrain && !streamClosed) {
          upstreamNeedsDrain = false;
          originalEmit('drain');
        }
      });

      res.once('close', () => {
        if (!res.writableFinished) {
          cleanupStreams();
        }
      });

      pipeline(gzipStream, downstreamSink, (err) => {
        const endCb = pendingEndCallback;
        pendingEndCallback = null;
        const alreadyClosedByClient = streamClosed;
        restoreResponseMethods();

        if (err) {
          streamClosed = true;
          releaseSocketDrain();
          // Ignore premature close already initiated by client disconnect; propagate genuine transform/sink errors
          if (!alreadyClosedByClient) {
            const headersAlreadyFlushed = res.headersSent;
            // Pipe() registers an internal `onerror` listener on `res` that re-throws if no real user error listener exists
            const hasUserErrorListener = res.listeners('error').some((fn) => fn.name !== 'onerror');
            if (hasUserErrorListener) {
              originalEmit('error', err);
            }
            if (!res.headersSent && !res.destroyed) {
              res.removeHeader('content-encoding');
              res.removeHeader('content-length');
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              invokeOriginal(
                originalEnd,
                JSON.stringify({ success: false, message: 'Compression stream failed.' }),
                'utf8'
              );
            } else if (headersAlreadyFlushed && !res.destroyed) {
              res.destroy();
            }
          }
          if (typeof endCb === 'function') endCb(err);
          return;
        }

        if (typeof endCb === 'function') endCb();
      });
    };

    res.write = function compressedWrite(rawChunk, rawEncoding, rawCb) {
      const { chunk, encoding, cb } = parseEndOrWriteArgs(rawChunk, rawEncoding, rawCb);
      if (bypassStreaming) {
        return invokeOriginal(originalWrite, chunk, encoding, cb);
      }
      if (streamClosed) {
        if (typeof cb === 'function') cb(new Error('Response stream closed.'));
        return false;
      }

      if (!hasStartedWrite) {
        hasStartedWrite = true;
        const contentLenHeader = Number(res.getHeader('content-length'));
        const belowThreshold =
          Number.isFinite(contentLenHeader) && contentLenHeader > 0 && contentLenHeader < threshold;

        if (res.headersSent || belowThreshold || !shouldCompressResponse(req, res)) {
          applyVaryIfCompressible(res);
          bypassStreaming = true;
          return invokeOriginal(originalWrite, chunk, encoding, cb);
        }
        initCompressionPipeline();
      }

      if (chunk == null) {
        if (typeof cb === 'function') cb();
        return !socketFull && !gzipWriteFull;
      }

      const gzipReady = gzipStream.write(chunk, encoding, cb);
      if (!gzipReady) gzipWriteFull = true;

      if (!gzipReady || socketFull) {
        upstreamNeedsDrain = true;
        return false;
      }
      return true;
    };

    res.end = function compressedEnd(rawChunk, rawEncoding, rawCb) {
      const { chunk, encoding, cb } = parseEndOrWriteArgs(rawChunk, rawEncoding, rawCb);

      if (gzipStream) {
        if (!res.headersSent) {
          res.removeHeader('content-length');
        }
        if (typeof cb === 'function') pendingEndCallback = cb;
        if (!streamClosed) {
          if (chunk != null) gzipStream.write(chunk, encoding);
          gzipStream.end();
        } else if (typeof cb === 'function') {
          cb();
        }
        return res;
      }

      if (hasStartedWrite || bypassStreaming || chunk == null || res.headersSent) {
        if (!res.headersSent) applyVaryIfCompressible(res);
        return invokeOriginal(originalEnd, chunk, encoding, cb);
      }

      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding || 'utf8');
      applyVaryIfCompressible(res);

      if (!shouldCompressResponse(req, res) || buf.length < threshold) {
        return invokeOriginal(originalEnd, chunk, encoding, cb);
      }

      zlib.gzip(buf, (err, compressed) => {
        if (err || res.headersSent || !compressed || compressed.length >= buf.length) {
          return invokeOriginal(originalEnd, chunk, encoding, cb);
        }
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', String(res.getHeader('vary') || 'Accept-Encoding'));
        res.setHeader('Content-Length', String(compressed.length));
        return invokeOriginal(originalEnd, compressed, undefined, cb);
      });
      return res;
    };

    next();
  };
};

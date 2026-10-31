export function sendSuccess(res, data, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    statusCode,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
}

export function sendError(res, message = 'Internal Server Error', statusCode = 500, errorName = 'ServerError', details = null) {
  return res.status(statusCode).json({
    success: false,
    statusCode,
    error: errorName,
    message,
    details,
    timestamp: new Date().toISOString(),
  });
}


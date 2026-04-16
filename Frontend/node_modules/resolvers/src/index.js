let isFun = fn => typeof fn === 'function'
let isNotNull = val => val !== null && val !== undefined
let Promisify = fn => {
  return (...args) => new Promise((resolve, reject) => {
    try {
      return Promise.resolve(fn(...args))
        .then(r => resolve(r), e => reject(e))
    } catch (e) {
      return reject(e)
    }
  });
}

let create = (resFn, errFn) => {
  const Resolvers = (...args) => {
    if (!isFun(resFn)) return Promise.resolve(null)
    return Promisify(resFn)(...args).catch(err => {
      if (!isFun(errFn)) throw err;
      return Promisify(errFn)(err, args).then(
        resErr => { throw resErr || err },
        resErr => { throw resErr || err }
      )
    })
  }
  Resolvers.create = (chilErr, cErrFn) => create((...args) => {
    const entry = isFun(resFn) ? Promisify(resFn)(...args) : Promise.resolve(null)
    return entry.then(r => isNotNull(r) ? r : (
        isFun(chilErr) ? Promisify(chilErr)(...args) : Promise.resolve(null)
      )
    )
  }, (err, args) => {
    const entry = isFun(cErrFn) ? Promisify(cErrFn)(err) : Promise.resolve(null);
    return entry.then(r => {
      if (isNotNull(r)) throw r
      return isFun(errFn) ? Promisify(errFn)(err).then(
        e => {  throw e || err; },
        e => { throw e || err; }) : Promise.resolve(null)
    })
  })
  
  return Resolvers
}
export default create

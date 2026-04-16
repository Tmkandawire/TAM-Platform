import resolvers from '../src';

let base = resolvers(param => {
  console.log('base', param)
})

let isAdmin  = base.create(param => {
  console.log('isAdmin', params)
})

isAdmin('userId')
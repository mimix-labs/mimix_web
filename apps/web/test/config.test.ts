import test from 'node:test'
import assert from 'node:assert/strict'
import {readWebConfig} from '../src/lib/config-values'
test('data backend defaults to API and Convex cannot silently run without Clerk',()=>{
 assert.equal(readWebConfig({}).dataBackend,'api')
 for(const env of [{MIMIX_DATA_BACKEND:'other'},{MIMIX_DATA_BACKEND:'convex'},{MIMIX_DATA_BACKEND:'convex',MIMIX_WEB_AUTH_MODE:'clerk'}])assert.throws(()=>readWebConfig(env))
})
test('validates the configured Convex endpoint without accepting credentials or query parameters',()=>{
 const env={MIMIX_DATA_BACKEND:'convex',MIMIX_WEB_AUTH_MODE:'clerk',CLERK_SECRET_KEY:'test',NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:'test'}
 assert.equal(readWebConfig({...env,NEXT_PUBLIC_CONVEX_URL:'https://test.convex.cloud'}).convexUrl,'https://test.convex.cloud')
 for(const url of ['https://user:secret@test.convex.cloud','https://test.convex.cloud?key=secret','https://test.convex.cloud/path'])assert.throws(()=>readWebConfig({...env,NEXT_PUBLIC_CONVEX_URL:url}))
})

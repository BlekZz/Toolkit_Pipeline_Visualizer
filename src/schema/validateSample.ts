import { parseScheduleDocument } from './validate'
import sampleData from '../data/sample-schedules.json'

const result = parseScheduleDocument(sampleData)

if (result.success) {
  console.log('✅ Sample JSON is valid')
  console.log(`   projects: ${result.data.projects.length}`)
  console.log(`   pipelines: ${result.data.pipelines.length}`)
  const scheduleCount = result.data.pipelines.reduce((n, p) => n + p.schedules.length, 0)
  console.log(`   total schedules: ${scheduleCount}`)
} else {
  console.error('❌ Sample JSON validation failed:')
  for (const err of result.errors) {
    console.error(`  [${err.path}] ${err.message}`)
  }
  throw new Error('Validation failed')
}

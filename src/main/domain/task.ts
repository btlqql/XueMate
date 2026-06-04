export type TaskStatus = 'pending' | 'done'

export interface Task {
  id: string
  title: string
  deadline: string
  deadlineTs: number
  format: string
  naming: string
  note: string
  status: TaskStatus
  sourceText: string
  createdAt: number
  reminded24h: boolean
  reminded1h: boolean
}

export type NewTask = Omit<Task, 'id' | 'createdAt'>

export type TaskEditableFields = Pick<
  Task,
  'title' | 'deadline' | 'deadlineTs' | 'format' | 'naming' | 'note'
>

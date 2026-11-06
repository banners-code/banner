import {render,screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {it,expect,vi} from 'vitest'
import AdminDashboard from './AdminDashboard'
it('shows approved deposit count separately from pending requests and links to review',()=>{
 const summary={total_users:1,active_users:0,active_sessions:0,total_sessions:0,spent_seconds:0,total_deposits:3,pending_deposits:2,open_reports:0,open_support:0,money:[{currency:'NGN',approved:12000,pending:5000}]}
 render(<MemoryRouter><AdminDashboard summary={summary} api={null} apiError="" notifications={[]} onRead={vi.fn()}/></MemoryRouter>)
 expect(screen.getByRole('link',{name:/Total deposits 3 Approved manual payments/})).toHaveAttribute('href','/admin/deposits')
 expect(screen.getByRole('link',{name:/Pending deposits 2/})).toHaveAttribute('href','/admin/deposits')
 expect(screen.getByText('NGN')).toBeInTheDocument()
})

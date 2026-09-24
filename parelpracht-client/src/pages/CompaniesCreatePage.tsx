import { Component } from 'react';
import { Modal } from 'semantic-ui-react';
import { Dispatch } from 'redux';
import { connect } from 'react-redux';
import { withTranslation, WithTranslation } from 'react-i18next';
import { Company, CompanyStatus, Roles } from '../clients/server.generated';
import { clearSingle } from '../stores/single/actionCreators';
import { RootState } from '../stores/store';
import CompanyProps from '../components/entities/company/CompanyProps';
import ResourceStatus from '../stores/resourceStatus';
import AlertContainer from '../components/alerts/AlertContainer';
import { getSingle } from '../stores/single/selectors';
import { SingleEntities } from '../stores/single/single';
import { TransientAlert } from '../stores/alerts/actions';
import { showTransientAlert } from '../stores/alerts/actionCreators';
import { TitleContext } from '../components/TitleContext';
import { withRouter, WithRouter } from '../WithRouter';

interface Props extends WithTranslation, WithRouter {
  status: ResourceStatus;

  clearCompany: () => void;
  showTransientAlert: (alert: TransientAlert) => void;
}

class CompaniesCreatePage extends Component<Props> {
  componentDidMount() {
    const { clearCompany, t } = this.props;
    clearCompany();
    document.title = t('entities.company.newCompany');
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.status === ResourceStatus.SAVING && this.props.status === ResourceStatus.FETCHED) {
      const { navigate } = this.props.router;
      navigate('/company');
      this.props.showTransientAlert({
        title: 'Success',
        message: 'Company successfully created',
        type: 'success',
        displayTimeInMs: 3000,
      });
    }
  }

  close = () => {
    const { navigate } = this.props.router;
    navigate(-1);
  };

  public render() {
    // TODO: Fix partial type in server so we do not need to override here
    const company = {
      id: 0,
      name: '',
      description: '',
      email: '',
      vatNumber: '',
      phoneNumber: '',
      status: CompanyStatus.ACTIVE,
      comments: '',
      addressStreet: '',
      addressCity: '',
      addressPostalCode: '',
      addressCountry: '',
    } as unknown as Company;

    return (
      <Modal onClose={this.close} open closeIcon dimmer="blurring" closeOnDimmerClick={false}>
        <Modal.Content>
          <AlertContainer />
          <Modal.Description>
            <CompanyProps
              company={company}
              create
              onCancel={this.close}
              canEdit={[Roles.ADMIN, Roles.GENERAL]}
              canDelete={[Roles.ADMIN]}
            />
          </Modal.Description>
        </Modal.Content>
      </Modal>
    );
  }
}

const mapStateToProps = (state: RootState) => {
  return {
    status: getSingle<Company>(state, SingleEntities.Company).status,
  };
};

const mapDispatchToProps = (dispatch: Dispatch) => ({
  clearCompany: () => dispatch(clearSingle(SingleEntities.Company)),
  showTransientAlert: (alert: TransientAlert) => dispatch(showTransientAlert(alert)),
});

CompaniesCreatePage.contextType = TitleContext;

export default withTranslation()(withRouter(connect(mapStateToProps, mapDispatchToProps)(CompaniesCreatePage)));
